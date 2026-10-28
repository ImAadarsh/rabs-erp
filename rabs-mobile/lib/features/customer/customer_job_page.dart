import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class CustomerJobPage extends ConsumerStatefulWidget {
  const CustomerJobPage({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<CustomerJobPage> createState() => _CustomerJobPageState();
}

class _CustomerJobPageState extends ConsumerState<CustomerJobPage> {
  Map<String, dynamic>? _job;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final j = await ref.read(dioProvider).portalGet('/jobs/${widget.jobId}') as Map<String, dynamic>;
      setState(() {
        _job = j;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    }
  }

  Future<void> _quoteAction(String action) async {
    final qid = _job?['quote']?['id'];
    if (qid == null) return;
    final ok = await confirmAction(
      context,
      title: action == 'accept' ? 'Accept this quotation?' : 'Decline this quotation?',
      body: action == 'accept'
          ? 'This locks the prices and lets RABS move on to deposit and fitting.'
          : 'We will mark the quote as declined. You can still call the office to discuss changes.',
      confirmLabel: action == 'accept' ? 'Yes, accept' : 'Yes, decline',
      destructive: action == 'decline',
    );
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).portalPost('/quotes/$qid/$action');
      if (mounted) {
        await showBusySnack(context, action == 'accept' ? 'Quote accepted — thank you' : 'Quote declined');
      }
      await _load();
    } catch (e) {
      if (mounted) await showBusySnack(context, apiErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Your job')), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_job == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final j = _job!;
    final status = j['status'] as Map? ?? {};
    final progress = j['progress'] as Map? ?? {};
    final money = j['money'] as Map? ?? {};
    final quote = j['quote'] as Map?;
    final steps = ((progress['steps'] as List?) ?? []).map((e) => nz((e as Map)['label'] ?? e, '')).where((s) => s.isNotEmpty).toList();
    final idx = (progress['index'] as num?)?.toInt() ?? 0;
    final bookings = (j['bookings'] as List?) ?? [];
    final payInfo = nz(j['paymentInstructions'], '');
    final site = nz(j['siteAddress'], '');

    return Scaffold(
      appBar: AppBar(title: Text(nz(j['jobNumber'], 'Your job'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const GuideBanner(
              title: 'Where your job is',
              body: 'The progress bar shows the journey from measure → quote → deposit → fitting → complete. Buttons appear when something needs your decision.',
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    humanStatus(status['label'] ?? j['statusLabel'] ?? status['code']),
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: RabsTheme.ink),
                  ),
                ),
                StatusChip(
                  label: nz(status['label'] ?? status['code'], 'In progress'),
                  colorHex: status['color']?.toString(),
                  textHex: status['textColor']?.toString(),
                ),
              ],
            ),
            if (site.isNotEmpty) Text(site, style: TextStyle(color: Colors.grey.shade700)),
            if (steps.isNotEmpty) ...[const SizedBox(height: 12), ProgressBar(steps: steps, index: idx)],
            const SizedBox(height: 12),
            SectionCard(
              title: 'Payment',
              subtitle: 'What is owed on this job',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _kv('Total', gbp.format((money['quoteTotal'] as num?)?.toDouble() ?? (money['total'] as num?)?.toDouble() ?? 0)),
                  _kv('Paid', gbp.format((money['paid'] as num?)?.toDouble() ?? 0)),
                  _kv('Balance due', gbp.format((money['balance'] as num?)?.toDouble() ?? 0)),
                  if (money['depositOutstanding'] != null && (money['depositOutstanding'] as num) > 0.005)
                    _kv('Deposit due', gbp.format((money['depositOutstanding'] as num).toDouble())),
                  if (payInfo.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(payInfo, style: TextStyle(color: Colors.grey.shade800, fontSize: 13, height: 1.35)),
                  ],
                ],
              ),
            ),
            if (quote != null) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Quotation ${nz(quote['quoteNumber'])}',
                subtitle: humanStatus(quote['status']),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      gbp.format((quote['total'] as num?)?.toDouble() ?? 0),
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 24, color: RabsTheme.brandDark),
                    ),
                    if (quote['status'] == 'sent') ...[
                      const SizedBox(height: 12),
                      GuideBanner(
                        title: 'Your decision',
                        body: 'Accept locks this price. Decline lets the office revise with you.',
                        icon: Icons.handshake_outlined,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _busy ? null : () => _quoteAction('accept'),
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
                        child: const Text('Accept quote'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(onPressed: _busy ? null : () => _quoteAction('decline'), child: const Text('Decline')),
                    ],
                  ],
                ),
              ),
            ],
            if (bookings.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Visits',
                subtitle: 'Fitting and delivery dates',
                child: Column(
                  children: [
                    for (final b in bookings)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(humanStatus((b as Map)['type']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(joinClean([fmtDate(b['scheduledDate']), b['slot'], humanStatus(b['status'])])),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [Expanded(child: Text(k)), Text(v, style: const TextStyle(fontWeight: FontWeight.w800))]),
      );
}
