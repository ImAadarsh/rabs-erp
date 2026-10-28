import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class BookingPage extends ConsumerStatefulWidget {
  const BookingPage({super.key, required this.jobId, required this.bookingId});
  final String jobId;
  final String bookingId;

  @override
  ConsumerState<BookingPage> createState() => _BookingPageState();
}

class _BookingPageState extends ConsumerState<BookingPage> {
  Map<String, dynamic>? _agg;
  String? _error;
  String? _busy;
  List<Map<String, dynamic>> _checklist = [];
  final _notes = TextEditingController();
  final _signedName = TextEditingController();
  final _sig = SignatureController(penStrokeWidth: 2.5, penColor: Colors.black);
  bool _init = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _notes.dispose();
    _signedName.dispose();
    _sig.dispose();
    super.dispose();
  }

  Map? get _booking {
    final list = _agg?['bookings'] as List? ?? [];
    return list.cast<Map>().where((b) => '${b['id']}' == widget.bookingId).firstOrNull;
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(dioProvider);
      final a = await dio.rabsGet('/jobs/${widget.jobId}') as Map<String, dynamic>;
      final b = (a['bookings'] as List).cast<Map>().where((x) => '${x['id']}' == widget.bookingId).firstOrNull;
      setState(() {
        _agg = a;
        _error = null;
        if (b != null && !_init) {
          _checklist = ((b['checklist'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          _notes.text = '${b['completionNotes'] ?? ''}';
          _signedName.text = '${b['signedName'] ?? a['customer']?['name'] ?? ''}';
          _init = true;
        }
      });
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    }
  }

  Future<void> _step(String key, Future<void> Function() fn, [String? okMsg]) async {
    setState(() => _busy = key);
    try {
      await fn();
      if (okMsg != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(okMsg)));
      }
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e)), backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _toggle(int i) async {
    final next = [
      for (var j = 0; j < _checklist.length; j++)
        {..._checklist[j], 'done': j == i ? !(_checklist[j]['done'] == true) : _checklist[j]['done'] == true}
    ];
    setState(() => _checklist = next);
    try {
      await ref.read(dioProvider).rabsPut('/bookings/${widget.bookingId}/checklist', data: {
        'checklist': next,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
      }
    }
  }

  Future<void> _pickPhotos(String kind) async {
    final picker = ImagePicker();
    final files = await picker.pickMultiImage(imageQuality: 85);
    if (files.isEmpty) return;
    await _step('photo-$kind', () async {
      final parts = <MultipartFile>[];
      for (final f in files) {
        parts.add(await MultipartFile.fromFile(f.path, filename: f.name));
      }
      await ref.read(dioProvider).rabsUpload('/bookings/${widget.bookingId}/photos', parts, fields: {'kind': kind});
    }, '${files.length} $kind photo(s) uploaded');
  }

  Future<String?> _sigDataUrl() async {
    if (_sig.isEmpty) return null;
    final bytes = await _sig.toPngBytes();
    if (bytes == null) return null;
    return 'data:image/png;base64,${base64Encode(bytes)}';
  }

  Future<void> _complete() async {
    final b = _booking;
    if (b == null) return;
    final after = ((b['photos'] as List?) ?? []).where((p) => (p as Map)['kind'] == 'after').length;
    if (after == 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Take at least one "after" photo first')));
      return;
    }
    if (b['signatureFileId'] == null) {
      if (_sig.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ask the customer to sign first')));
        return;
      }
      if (_signedName.text.trim().length < 2) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter the name of the person signing')));
        return;
      }
      final dataUrl = await _sigDataUrl();
      if (dataUrl == null) return;
      await _step('sign', () async {
        await ref.read(dioProvider).rabsPost('/bookings/${widget.bookingId}/signature', data: {
          'dataUrl': dataUrl,
          'signedName': _signedName.text.trim(),
        });
      });
      await _load();
      if (_booking?['signatureFileId'] == null) return;
    }
    await _step('complete', () async {
      await ref.read(dioProvider).rabsPost('/bookings/${widget.bookingId}/complete', data: {
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      });
    }, '${b['type'] == 'fitting' ? 'Fitting' : 'Delivery'} complete');
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_agg == null || _booking == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final b = _booking!;
    final customer = _agg!['customer'] as Map;
    final job = _agg!['job'] as Map;
    final done = b['status'] == 'complete';
    final before = ((b['photos'] as List?) ?? []).where((p) => (p as Map)['kind'] == 'before').toList();
    final after = ((b['photos'] as List?) ?? []).where((p) => (p as Map)['kind'] == 'after').toList();
    final doneCount = _checklist.where((c) => c['done'] == true).length;
    final site = '${_agg!['siteAddress'] ?? ''}';

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${b['type']}'.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            Text('${fmtDate(b['scheduledDate'])} · ${job['jobNumber']}', style: const TextStyle(fontSize: 12)),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: StatusChip(
                label: '${b['status']}'.replaceAll('_', ' '),
                colorHex: done ? '#16A34A' : b['status'] == 'in_progress' ? '#F59E0B' : '#2563EB',
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${customer['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                if (site.isNotEmpty) Text(site, style: TextStyle(color: Colors.grey.shade700)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => launchPhone('${customer['phone']}'),
                        icon: const Icon(Icons.phone),
                        label: const Text('Call'),
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF059669)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => launchMaps(site),
                        icon: const Icon(Icons.map),
                        label: const Text('Directions'),
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (!done && b['status'] == 'booked')
            FilledButton.icon(
              onPressed: _busy != null
                  ? null
                  : () => _step('start', () async {
                        await ref.read(dioProvider).rabsPost('/bookings/${widget.bookingId}/start');
                      }, 'Started'),
              icon: const Icon(Icons.play_arrow),
              label: Text(_busy == 'start' ? 'Starting…' : 'Start ${b['type']}'),
            ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Checklist ($doneCount/${_checklist.length})',
            child: Column(
              children: [
                for (var i = 0; i < _checklist.length; i++)
                  CheckboxListTile(
                    value: _checklist[i]['done'] == true,
                    onChanged: done ? null : (_) => _toggle(i),
                    title: Text('${_checklist[i]['label']}'),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Photos',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Before (${before.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (!done)
                  OutlinedButton.icon(
                    onPressed: _busy != null ? null : () => _pickPhotos('before'),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Add before photos'),
                  ),
                const SizedBox(height: 12),
                Text('After (${after.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (!done)
                  OutlinedButton.icon(
                    onPressed: _busy != null ? null : () => _pickPhotos('after'),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Add after photos'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Notes',
            child: TextField(
              controller: _notes,
              maxLines: 3,
              enabled: !done,
              decoration: const InputDecoration(hintText: 'Completion notes'),
              onEditingComplete: () async {
                await ref.read(dioProvider).rabsPut('/bookings/${widget.bookingId}/checklist', data: {
                  'checklist': _checklist,
                  'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
                });
              },
            ),
          ),
          if (!done) ...[
            const SizedBox(height: 12),
            SectionCard(
              title: 'Customer signature',
              child: Column(
                children: [
                  TextField(controller: _signedName, decoration: const InputDecoration(labelText: 'Signed by')),
                  const SizedBox(height: 8),
                  Container(
                    height: 160,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Signature(controller: _sig, backgroundColor: Colors.white),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(onPressed: _sig.clear, child: const Text('Clear')),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy != null ? null : _complete,
              style: FilledButton.styleFrom(backgroundColor: RabsTheme.brandDark, minimumSize: const Size.fromHeight(56)),
              child: Text(_busy == 'complete' || _busy == 'sign' ? 'Please wait…' : 'Complete ${b['type']}'),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
