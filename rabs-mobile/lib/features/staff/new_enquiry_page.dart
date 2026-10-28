import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../shared/widgets.dart';

class NewEnquiryPage extends ConsumerStatefulWidget {
  const NewEnquiryPage({super.key});

  @override
  ConsumerState<NewEnquiryPage> createState() => _NewEnquiryPageState();
}

class _NewEnquiryPageState extends ConsumerState<NewEnquiryPage> {
  final _search = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _line1 = TextEditingController();
  final _city = TextEditingController();
  final _postcode = TextEditingController();
  String _source = 'Phone';
  String? _existingCustomerId;
  List<Map<String, dynamic>> _hits = [];
  bool _busy = false;
  bool _allowDuplicate = false;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _line1.dispose();
    _city.dispose();
    _postcode.dispose();
    super.dispose();
  }

  Future<void> _doSearch(String q) async {
    if (q.trim().length < 2) {
      setState(() => _hits = []);
      return;
    }
    try {
      final r = await ref.read(dioProvider).rabsGet('/search', query: {'q': q.trim()}) as Map;
      final customers = ((r['customersWithoutJobs'] as List?) ?? []).cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      final fromJobs = ((r['jobs'] as List?) ?? [])
          .cast<Map>()
          .map((j) => {
                'id': j['customerId'],
                'name': j['customerName'],
                'phone': j['customerPhone'],
                'fromJob': true,
                'jobId': j['id'],
                'jobNumber': j['jobNumber'],
              })
          .where((c) => c['id'] != null)
          .toList();
      setState(() => _hits = [...customers, ...fromJobs.map((e) => Map<String, dynamic>.from(e))]);
    } catch (_) {
      setState(() => _hits = []);
    }
  }

  void _pickExisting(Map<String, dynamic> c) {
    if (c['fromJob'] == true && c['jobId'] != null) {
      context.go('/staff/jobs/${c['jobId']}');
      return;
    }
    setState(() {
      _existingCustomerId = '${c['id']}';
      _name.text = '${c['name'] ?? ''}';
      _phone.text = '${c['phone'] ?? ''}';
      _email.text = '${c['email'] ?? ''}';
      _line1.text = '${c['addressLine1'] ?? ''}';
      _city.text = '${c['city'] ?? ''}';
      _postcode.text = '${c['postcode'] ?? ''}';
      _hits = [];
      _search.clear();
    });
  }

  void _clearExisting() {
    setState(() {
      _existingCustomerId = null;
      _name.clear();
      _phone.clear();
      _email.clear();
      _line1.clear();
      _city.clear();
      _postcode.clear();
    });
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final body = <String, dynamic>{
        'notes': 'Lead source: $_source',
        'allowDuplicate': _allowDuplicate,
      };
      if (_existingCustomerId != null) {
        body['customerId'] = _existingCustomerId;
      } else {
        body['customer'] = {
          'name': _name.text.trim(),
          'phone': _phone.text.trim(),
          'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
          'addressLine1': _line1.text.trim().isEmpty ? null : _line1.text.trim(),
          'city': _city.text.trim().isEmpty ? null : _city.text.trim(),
          'postcode': _postcode.text.trim().isEmpty ? null : _postcode.text.trim(),
        };
      }
      final res = await dio.rabsPost('/enquiries', data: body) as Map;
      final jobId = res['job']?['id'] ?? res['id'];
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enquiry created')));
        if (jobId != null) {
          context.go('/staff/jobs/$jobId');
        } else {
          context.go('/staff/jobs');
        }
      }
    } catch (e) {
      final msg = apiErrorMessage(e);
      setState(() {
        _error = msg;
        if (msg.toLowerCase().contains('already')) _allowDuplicate = true;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _canSubmit {
    if (_existingCustomerId != null) return true;
    return _name.text.trim().isNotEmpty && _phone.text.trim().isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New enquiry')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GuideBanner(
            title: 'Start with a search',
            body: 'Look up the customer first so you do not create a duplicate. Only fill the form if they are new.',
            icon: Icons.person_search_outlined,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _search,
            decoration: const InputDecoration(
              labelText: 'Search name, phone, address, job…',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: _doSearch,
          ),
          if (_hits.isNotEmpty) ...[
            const SizedBox(height: 8),
            ..._hits.take(8).map((c) => ListTile(
                  dense: true,
                  title: Text('${c['name']}'),
                  subtitle: Text(c['fromJob'] == true
                      ? 'Existing job ${c['jobNumber']} · ${c['phone'] ?? ''}'
                      : '${c['phone'] ?? ''} · ${c['postcode'] ?? ''}'),
                  onTap: () => _pickExisting(c),
                )),
          ],
          if (_existingCustomerId != null) ...[
            const SizedBox(height: 8),
            Material(
              color: const Color(0xFFFCE8E9),
              borderRadius: BorderRadius.circular(12),
              child: ListTile(
                title: Text('Using existing customer: ${_name.text}', style: const TextStyle(fontWeight: FontWeight.w700)),
                trailing: TextButton(onPressed: _clearExisting, child: const Text('Clear')),
              ),
            ),
          ],
          const SizedBox(height: 16),
          TextField(controller: _name, enabled: _existingCustomerId == null, decoration: const InputDecoration(labelText: 'Name *'), onChanged: (_) => setState(() {})),
          const SizedBox(height: 10),
          TextField(controller: _phone, enabled: _existingCustomerId == null, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone *'), onChanged: (_) => setState(() {})),
          const SizedBox(height: 10),
          TextField(controller: _email, enabled: _existingCustomerId == null, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
          const SizedBox(height: 10),
          TextField(controller: _line1, enabled: _existingCustomerId == null, decoration: const InputDecoration(labelText: 'Address line 1')),
          const SizedBox(height: 10),
          TextField(controller: _city, enabled: _existingCustomerId == null, decoration: const InputDecoration(labelText: 'City')),
          const SizedBox(height: 10),
          TextField(controller: _postcode, enabled: _existingCustomerId == null, decoration: const InputDecoration(labelText: 'Postcode')),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _source,
            decoration: const InputDecoration(labelText: 'Lead source'),
            items: const [
              'Walk-in', 'Phone', 'WhatsApp', 'Facebook', 'Instagram', 'Website', 'Referral', 'Repeat customer', 'Other'
            ].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
            onChanged: (v) => setState(() => _source = v ?? 'Phone'),
          ),
          if (_allowDuplicate)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Create anyway (duplicate phone/email)'),
              value: _allowDuplicate,
              onChanged: (v) => setState(() => _allowDuplicate = v ?? false),
            ),
          if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(_error!)],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy || !_canSubmit ? null : _submit,
            child: _busy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create enquiry'),
          ),
        ],
      ),
    );
  }
}
