import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/meta_provider.dart';
import '../../shared/widgets.dart';

const _actionCap = {
  'book_appointment': 'appointments',
  'start_measurement': 'measure',
  'create_quote': 'quotes',
  'accept_quote': 'accept',
  'convert_job': 'accept',
  'record_deposit': 'payments',
  'check_materials': 'materials',
  'book_fitting': 'bookings',
  'book_delivery': 'bookings',
  'open_fitting': 'fieldwork',
  'open_delivery': 'fieldwork',
  'collect_balance': 'payments',
  'close_job': 'payments',
  'resolve_issue': 'bookings',
};

class JobDetailPage extends ConsumerStatefulWidget {
  const JobDetailPage({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<JobDetailPage> createState() => _JobDetailPageState();
}

class _JobDetailPageState extends ConsumerState<JobDetailPage> {
  Map<String, dynamic>? _agg;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final a = await ref.read(dioProvider).rabsGet('/jobs/${widget.jobId}') as Map<String, dynamic>;
      setState(() {
        _agg = a;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    }
  }

  Future<void> _act(Future Function() fn, [String? msg]) async {
    setState(() => _busy = true);
    try {
      final r = await fn();
      if (r is Map && r['job'] != null) {
        setState(() => _agg = Map<String, dynamic>.from(r));
      } else {
        await _load();
      }
      if (msg != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e)), backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map? _activeBooking(String type) {
    final bookings = (_agg?['bookings'] as List?) ?? [];
    return bookings.cast<Map>().where((b) => b['type'] == type && b['status'] != 'cancelled' && b['status'] != 'complete').firstOrNull;
  }

  Future<void> _runNext() async {
    final next = _agg?['nextAction'] as Map?;
    if (next == null) return;
    final code = '${next['code']}';
    final id = widget.jobId;
    final dio = ref.read(dioProvider);

    switch (code) {
      case 'book_appointment':
        await _showAppointment();
        return;
      case 'start_measurement':
        await _act(() => dio.rabsPost('/jobs/$id/measurement'), 'Measurement started');
        if (mounted) context.push('/staff/jobs/$id/measure');
        return;
      case 'create_quote':
        await _act(() => dio.rabsPost('/jobs/$id/quotes'), 'Quote created');
        if (mounted) context.push('/staff/jobs/$id/quote');
        return;
      case 'accept_quote':
        final qid = _agg?['currentQuote']?['quote']?['id'];
        if (qid == null) return;
        await _act(() => dio.rabsPost('/quotes/$qid/accept', data: {}), 'Quote accepted');
        return;
      case 'convert_job':
        await _act(() => dio.rabsPost('/jobs/$id/convert'), 'Converted to job');
        return;
      case 'record_deposit':
      case 'collect_balance':
        await _showPayment(code == 'record_deposit' ? 'deposit' : 'balance');
        return;
      case 'check_materials':
        await _act(() => dio.rabsPost('/jobs/$id/materials/check'), 'Materials checked');
        return;
      case 'book_fitting':
        await _showBooking('fitting');
        return;
      case 'book_delivery':
        await _showBooking('delivery');
        return;
      case 'open_fitting':
      case 'open_delivery':
        final b = _activeBooking(code == 'open_fitting' ? 'fitting' : 'delivery');
        if (b != null && mounted) context.push('/staff/jobs/$id/work/${b['id']}');
        return;
      case 'close_job':
        await _act(() => dio.rabsPost('/jobs/$id/close', data: {}), 'Job closed');
        return;
      case 'resolve_issue':
        await _act(() => dio.rabsPost('/jobs/$id/issue/resolve', data: {'note': 'Resolved on mobile'}), 'Issue resolved');
        return;
    }
  }

  Future<void> _showAppointment() async {
    final meta = await ref.read(rabsMetaProvider.future);
    final staff = metaStaff(meta);
    String? staffId = staff.isNotEmpty ? '${staff.first['id']}' : null;
    DateTime when = DateTime.now().add(const Duration(days: 1));
    String purpose = 'measure';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Book appointment'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(fmtDateTime(when.toIso8601String())),
                trailing: const Icon(Icons.edit_calendar),
                onTap: () async {
                  final d = await showDatePicker(context: ctx, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: when);
                  if (d == null) return;
                  final t = await showTimePicker(context: ctx, initialTime: TimeOfDay.fromDateTime(when));
                  if (t == null) return;
                  setLocal(() => when = DateTime(d.year, d.month, d.day, t.hour, t.minute));
                },
              ),
              DropdownButtonFormField<String>(
                initialValue: purpose,
                decoration: const InputDecoration(labelText: 'Purpose'),
                items: const [
                  DropdownMenuItem(value: 'measure', child: Text('Measure & quote')),
                  DropdownMenuItem(value: 'consultation', child: Text('Consultation')),
                  DropdownMenuItem(value: 'sample', child: Text('Samples')),
                  DropdownMenuItem(value: 'snag', child: Text('Snag / aftercare')),
                ],
                onChanged: (v) => setLocal(() => purpose = v ?? 'measure'),
              ),
              if (staff.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: staffId,
                  decoration: const InputDecoration(labelText: 'Assigned staff'),
                  items: staff.map((s) => DropdownMenuItem(value: '${s['id']}', child: Text('${s['name'] ?? s['email']}'))).toList(),
                  onChanged: (v) => setLocal(() => staffId = v),
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Book')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    await _act(
      () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/appointments', data: {
        'scheduledAt': when.toIso8601String(),
        'purpose': purpose,
        if (staffId != null) 'staffUserId': staffId,
      }),
      'Appointment booked',
    );
  }

  Future<void> _showPayment(String mode) async {
    final money = _agg?['money'] as Map?;
    final amountCtrl = TextEditingController(
      text: mode == 'deposit'
          ? '${money?['depositOutstanding'] ?? money?['depositRequired'] ?? ''}'
          : '${money?['balance'] ?? ''}',
    );
    final refCtrl = TextEditingController();
    String method = 'cash';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(mode == 'deposit' ? 'Record deposit' : 'Collect balance'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount (£)', prefixText: '£ '),
              ),
              DropdownButtonFormField<String>(
                initialValue: method,
                decoration: const InputDecoration(labelText: 'Method'),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('Cash')),
                  DropdownMenuItem(value: 'card', child: Text('Card')),
                  DropdownMenuItem(value: 'bank_transfer', child: Text('Bank transfer')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (v) => setLocal(() => method = v ?? 'cash'),
              ),
              TextField(controller: refCtrl, decoration: const InputDecoration(labelText: 'Reference (optional)')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim());
    if (amount == null || amount <= 0) return;
    await _act(
      () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/payments', data: {
        'amount': amount,
        'method': method,
        'kind': mode == 'deposit' ? 'deposit' : 'balance',
        if (refCtrl.text.trim().isNotEmpty) 'reference': refCtrl.text.trim(),
      }),
      'Payment recorded',
    );
  }

  Future<void> _showBooking(String type) async {
    final day = DateTime.now().add(const Duration(days: 2));
    final date = '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Book $type'),
        content: Text('Book for $date (AM)? Assign from diary later if needed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Book')),
        ],
      ),
    );
    if (ok != true) return;
    await _act(
      () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/bookings', data: {
        'type': type,
        'scheduledDate': date,
        'slot': 'AM',
      }),
      '${type[0].toUpperCase()}${type.substring(1)} booked',
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (_error != null) {
      return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_agg == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final job = _agg!['job'] as Map;
    final customer = _agg!['customer'] as Map;
    final status = _agg!['status'] as Map? ?? {};
    final progress = _agg!['progress'] as Map? ?? {};
    final next = _agg!['nextAction'] as Map?;
    final money = _agg!['money'] as Map?;
    final steps = ((progress['steps'] as List?) ?? []).map((e) => '${(e as Map)['label'] ?? e}').toList();
    final idx = (progress['index'] as num?)?.toInt() ?? 0;
    final cap = next == null ? null : _actionCap['${next['code']}'] ?? 'customers';
    final canNext = next != null && (user?.can(cap!) ?? false);

    return Scaffold(
      appBar: AppBar(
        title: Text('${job['jobNumber']}'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(child: Text('${customer['name']}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20))),
                StatusChip(label: '${status['label'] ?? status['code'] ?? job['status']}', colorHex: status['color']?.toString(), textHex: status['textColor']?.toString()),
              ],
            ),
            if (_agg!['siteAddress'] != null) Text('${_agg!['siteAddress']}', style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Row(
              children: [
                if (customer['phone'] != null)
                  TextButton.icon(onPressed: () => launchPhone('${customer['phone']}'), icon: const Icon(Icons.phone), label: const Text('Call')),
                TextButton.icon(onPressed: () => launchMaps('${_agg!['siteAddress']}'), icon: const Icon(Icons.map), label: const Text('Map')),
              ],
            ),
            if (steps.isNotEmpty) ...[
              const SizedBox(height: 8),
              ProgressBar(steps: steps, index: idx),
            ],
            if (money != null) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Money',
                child: Column(
                  children: [
                    _kv('Total', gbp.format((money['total'] as num?)?.toDouble() ?? (money['quoteTotal'] as num?)?.toDouble() ?? 0)),
                    _kv('Deposit required', gbp.format((money['depositRequired'] as num?)?.toDouble() ?? 0)),
                    _kv('Paid', gbp.format((money['paid'] as num?)?.toDouble() ?? 0)),
                    _kv('Balance', gbp.format((money['balance'] as num?)?.toDouble() ?? 0)),
                    if (money['depositOutstanding'] != null) _kv('Deposit due', gbp.format((money['depositOutstanding'] as num).toDouble())),
                  ],
                ),
              ),
            ],
            if (((_agg!['materials'] as List?) ?? []).isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Materials · ${job['materialsStatus'] ?? ''}',
                child: Column(
                  children: [
                    for (final m in (_agg!['materials'] as List))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text('${(m as Map)['description'] ?? m['product']?['name'] ?? 'Item'}'),
                        subtitle: Text('Need ${m['qtyRequired'] ?? m['qty']} · reserved ${m['qtyReserved'] ?? 0} · ${m['status'] ?? ''}'),
                        trailing: user?.can('materials') == true && m['status'] == 'to_order'
                            ? TextButton(
                                onPressed: () => _act(
                                  () => ref.read(dioProvider).rabsPost('/materials/${m['id']}/status', data: {'status': 'ordered'}),
                                  'Marked ordered',
                                ),
                                child: const Text('Ordered'),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ],
            if (((_agg!['bookings'] as List?) ?? []).isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Fitting / delivery',
                child: Column(
                  children: [
                    for (final b in (_agg!['bookings'] as List))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text('${(b as Map)['type']}'.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${fmtDate(b['scheduledDate'])} · ${b['slot'] ?? ''} · ${b['staffName'] ?? 'Unassigned'} · ${b['status']}'),
                        trailing: b['status'] != 'complete' && b['status'] != 'cancelled'
                            ? IconButton(
                                icon: const Icon(Icons.chevron_right),
                                onPressed: () => context.push('/staff/jobs/${widget.jobId}/work/${b['id']}'),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ],
            if (((_agg!['timeline'] as List?) ?? []).isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'History',
                child: Column(
                  children: [
                    for (final t in (_agg!['timeline'] as List).take(12))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text('${(t as Map)['message'] ?? t['summary'] ?? t['event']}', style: const TextStyle(fontSize: 13)),
                        subtitle: Text(fmtDateTime(t['createdAt'])),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (user?.can('measure') == true)
                  OutlinedButton.icon(onPressed: () => context.push('/staff/jobs/${widget.jobId}/measure'), icon: const Icon(Icons.straighten), label: const Text('Measure')),
                if (user?.can('quotes') == true)
                  OutlinedButton.icon(onPressed: () => context.push('/staff/jobs/${widget.jobId}/quote'), icon: const Icon(Icons.request_quote), label: const Text('Quote')),
                if (user?.can('invoices') == true)
                  OutlinedButton(
                    onPressed: () => _act(() => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/invoice'), 'Invoice generated'),
                    child: const Text('Invoice'),
                  ),
                if (user?.can('bookings') == true)
                  OutlinedButton(
                    onPressed: () => _act(
                      () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/issue', data: {'note': 'Issue raised from mobile'}),
                      'Issue raised',
                    ),
                    child: const Text('Raise issue'),
                  ),
              ],
            ),
            if (canNext) ...[
              const SizedBox(height: 16),
              NextActionButton(label: '${next['label']}', onPressed: _runNext, busy: _busy),
            ],
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(child: Text(k, style: TextStyle(color: Colors.grey.shade700))),
            Text(v, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
