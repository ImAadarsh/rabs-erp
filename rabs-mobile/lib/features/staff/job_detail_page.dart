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
    final label = nz(next['label'], humanStatus(code));
    final id = widget.jobId;
    final dio = ref.read(dioProvider);

    final needsConfirm = {
      'accept_quote',
      'convert_job',
      'close_job',
      'create_quote',
      'check_materials',
      'resolve_issue',
    }.contains(code);
    if (needsConfirm) {
      final ok = await confirmAction(
        context,
        title: label,
        body: '${nextActionHint(code)}\n\nContinue with “$label”?',
        confirmLabel: 'Yes, continue',
      );
      if (!ok) return;
    }

    switch (code) {
      case 'book_appointment':
        await _showAppointment();
        return;
      case 'start_measurement':
        await _act(() => dio.rabsPost('/jobs/$id/measurement'), 'Measurement started — enter rooms next');
        if (mounted) context.push('/staff/jobs/$id/measure');
        return;
      case 'create_quote':
        await _act(() => dio.rabsPost('/jobs/$id/quotes'), 'Quotation created from measurements');
        if (mounted) context.push('/staff/jobs/$id/quote');
        return;
      case 'accept_quote':
        final qid = _agg?['currentQuote']?['quote']?['id'];
        if (qid == null) {
          await showBusySnack(context, 'No quotation to accept yet', error: true);
          return;
        }
        await _act(() => dio.rabsPost('/quotes/$qid/accept', data: {}), 'Quote accepted — prices locked');
        return;
      case 'convert_job':
        await _act(() => dio.rabsPost('/jobs/$id/convert'), 'Converted — ready for deposit & booking');
        return;
      case 'record_deposit':
      case 'collect_balance':
        await _showPayment(code == 'record_deposit' ? 'deposit' : 'balance');
        return;
      case 'check_materials':
        await _act(() => dio.rabsPost('/jobs/$id/materials/check'), 'Materials checked against stock');
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
        if (b == null) {
          await showBusySnack(context, 'No active ${code == 'open_fitting' ? 'fitting' : 'delivery'} booking', error: true);
          return;
        }
        if (mounted) context.push('/staff/jobs/$id/work/${b['id']}');
        return;
      case 'close_job':
        await _act(() => dio.rabsPost('/jobs/$id/close', data: {}), 'Job closed');
        return;
      case 'resolve_issue':
        await _act(() => dio.rabsPost('/jobs/$id/issue/resolve', data: {'note': 'Resolved on mobile'}), 'Issue cleared — job can continue');
        return;
      default:
        await showBusySnack(context, 'This step is not available on mobile yet. Use the office web app.', error: true);
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
    final ok = await confirmAction(
      context,
      title: 'Book ${humanStatus(type)}',
      body: 'Schedule $type for $date (AM slot).\n\nYou can reassign staff from the diary afterwards.',
      confirmLabel: 'Book $type',
    );
    if (!ok) return;
    await _act(
      () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/bookings', data: {
        'type': type,
        'scheduledDate': date,
        'slot': 'AM',
      }),
      '${humanStatus(type)} booked for $date',
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Job')), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
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
    final steps = ((progress['steps'] as List?) ?? []).map((e) => nz((e as Map)['label'] ?? e, '')).where((s) => s.isNotEmpty).toList();
    final idx = (progress['index'] as num?)?.toInt() ?? 0;
    final nextCode = next == null ? null : '${next['code']}';
    final cap = nextCode == null ? null : _actionCap[nextCode] ?? 'customers';
    final canNext = next != null && (user?.can(cap!) ?? false);
    final site = nz(_agg!['siteAddress'] ?? customer['addressLine1'], '');
    final phone = nz(customer['phone'], '');
    final materials = (_agg!['materials'] as List?) ?? [];
    final bookings = (_agg!['bookings'] as List?) ?? [];
    final timeline = (_agg!['timeline'] as List?) ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Text(nz(job['jobNumber'], 'Job')),
        actions: [
          IconButton(tooltip: 'Refresh job', icon: const Icon(Icons.refresh), onPressed: _busy ? null : _load),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(nz(customer['name'], 'Customer'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22, color: Color(0xFF141111))),
                      if (site.isNotEmpty) Text(site, style: TextStyle(color: Colors.grey.shade700, height: 1.3)),
                    ],
                  ),
                ),
                StatusChip(
                  label: nz(status['label'] ?? status['code'] ?? job['status'], 'In progress'),
                  colorHex: status['color']?.toString(),
                  textHex: status['textColor']?.toString(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              children: [
                if (phone.isNotEmpty)
                  TextButton.icon(onPressed: () => launchPhone(phone), icon: const Icon(Icons.phone), label: const Text('Call customer')),
                if (site.isNotEmpty)
                  TextButton.icon(onPressed: () => launchMaps(site), icon: const Icon(Icons.map), label: const Text('Directions')),
              ],
            ),
            if (steps.isNotEmpty) ...[
              const SizedBox(height: 8),
              ProgressBar(steps: steps, index: idx),
              const SizedBox(height: 6),
              Text('Job progress — completed steps stay highlighted', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
            if (canNext) ...[
              const SizedBox(height: 16),
              NextActionButton(
                label: nz(next['label'], 'Continue'),
                hint: nextActionHint(nextCode),
                onPressed: _runNext,
                busy: _busy,
              ),
            ] else if (next != null) ...[
              const SizedBox(height: 16),
              GuideBanner(
                title: 'Waiting on another role',
                body: 'Next step is “${nz(next['label'])}”, but your login cannot do that action. Ask office staff or switch account.',
                icon: Icons.lock_outline,
              ),
            ],
            if (money != null) ...[
              const SizedBox(height: 14),
              SectionCard(
                title: 'Money',
                subtitle: 'Only customer-facing totals — no catalogue costs here',
                child: Column(
                  children: [
                    _kv('Quote / job total', gbp.format((money['total'] as num?)?.toDouble() ?? (money['quoteTotal'] as num?)?.toDouble() ?? 0)),
                    _kv('Deposit required', gbp.format((money['depositRequired'] as num?)?.toDouble() ?? 0)),
                    _kv('Paid so far', gbp.format((money['paid'] as num?)?.toDouble() ?? 0)),
                    _kv('Balance due', gbp.format((money['balance'] as num?)?.toDouble() ?? 0)),
                    if (money['depositOutstanding'] != null && (money['depositOutstanding'] as num) > 0.005)
                      _kv('Deposit still due', gbp.format((money['depositOutstanding'] as num).toDouble())),
                  ],
                ),
              ),
            ],
            if (materials.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Materials',
                subtitle: materialsStatusLabel(job['materialsStatus']),
                child: Column(
                  children: [
                    for (final m in materials)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(nz((m as Map)['description'] ?? m['product']?['name'], 'Material line'), style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(joinClean([
                          'Need ${nz(m['qtyRequired'] ?? m['qty'], '?')}',
                          'Reserved ${nz(m['qtyReserved'], '0')}',
                          materialsStatusLabel(m['status']),
                        ])),
                        trailing: user?.can('materials') == true && m['status'] == 'to_order'
                            ? TextButton(
                                onPressed: _busy
                                    ? null
                                    : () async {
                                        final ok = await confirmAction(
                                          context,
                                          title: 'Mark as ordered?',
                                          body: 'Confirm purchasing has ordered: ${nz(m['description'], 'this item')}.',
                                          confirmLabel: 'Yes, ordered',
                                        );
                                        if (!ok) return;
                                        await _act(
                                          () => ref.read(dioProvider).rabsPost('/materials/${m['id']}/status', data: {'status': 'ordered'}),
                                          'Marked ordered',
                                        );
                                      },
                                child: const Text('Ordered'),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ],
            if (bookings.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Fitting & delivery',
                subtitle: 'Open a booking to run the on-site checklist',
                child: Column(
                  children: [
                    for (final b in bookings)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(humanStatus((b as Map)['type']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(joinClean([
                          fmtDate(b['scheduledDate']),
                          nz(b['slot'], ''),
                          nz(b['staffName'], 'Unassigned'),
                          humanStatus(b['status']),
                        ])),
                        trailing: b['status'] != 'complete' && b['status'] != 'cancelled'
                            ? IconButton(
                                tooltip: 'Open ${humanStatus(b['type'])} checklist',
                                icon: const Icon(Icons.chevron_right, color: Color(0xFFA31F24)),
                                onPressed: () => context.push('/staff/jobs/${widget.jobId}/work/${b['id']}'),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ],
            if (timeline.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'History',
                subtitle: 'What has already happened on this job',
                child: Column(
                  children: [
                    for (final t in timeline.take(12))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(nz((t as Map)['message'] ?? t['summary'], humanStatus(t['event'])), style: const TextStyle(fontSize: 13)),
                        subtitle: Text(fmtDateTime(t['createdAt'])),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Text('More actions', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.grey.shade800)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (user?.can('measure') == true)
                  OutlinedButton.icon(
                    onPressed: () => context.push('/staff/jobs/${widget.jobId}/measure'),
                    icon: const Icon(Icons.straighten),
                    label: const Text('Rooms & measure'),
                  ),
                if (user?.can('quotes') == true)
                  OutlinedButton.icon(
                    onPressed: () => context.push('/staff/jobs/${widget.jobId}/quote'),
                    icon: const Icon(Icons.request_quote),
                    label: const Text('Quotation'),
                  ),
                if (user?.can('invoices') == true)
                  OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            final ok = await confirmAction(
                              context,
                              title: 'Generate invoice?',
                              body: 'Creates the invoice from the accepted quote and approved variations.',
                              confirmLabel: 'Generate',
                            );
                            if (!ok) return;
                            await _act(() => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/invoice'), 'Invoice generated');
                          },
                    child: const Text('Invoice'),
                  ),
                if (user?.can('bookings') == true)
                  OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            final ok = await confirmAction(
                              context,
                              title: 'Raise an issue?',
                              body: 'Pauses the normal next step until someone resolves the snag.',
                              confirmLabel: 'Raise issue',
                              destructive: true,
                            );
                            if (!ok) return;
                            await _act(
                              () => ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/issue', data: {'note': 'Issue raised from mobile'}),
                              'Issue raised — resolve when fixed',
                            );
                          },
                    child: const Text('Raise issue'),
                  ),
              ],
            ),
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
