import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
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
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).portalPost('/quotes/$qid/$action');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(action == 'accept' ? 'Quote accepted — thank you' : 'Quote declined')));
      }
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_job == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final j = _job!;
    final status = j['status'] as Map? ?? {};
    final progress = j['progress'] as Map? ?? {};
    final money = j['money'] as Map? ?? {};
    final quote = j['quote'] as Map?;
    final steps = ((progress['steps'] as List?) ?? []).map((e) => '${(e as Map)['label'] ?? e}').toList();
    final idx = (progress['index'] as num?)?.toInt() ?? 0;
    final bookings = (j['bookings'] as List?) ?? [];
    final payInfo = '${j['paymentInstructions'] ?? ''}';

    return Scaffold(
      appBar: AppBar(title: Text('${j['jobNumber']}')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(child: Text('${status['label'] ?? j['statusLabel'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
                StatusChip(label: '${status['label'] ?? status['code'] ?? ''}', colorHex: status['color']?.toString(), textHex: status['textColor']?.toString()),
              ],
            ),
            if (j['siteAddress'] != null) Text('${j['siteAddress']}', style: TextStyle(color: Colors.grey.shade700)),
            if (steps.isNotEmpty) ...[const SizedBox(height: 12), ProgressBar(steps: steps, index: idx)],
            const SizedBox(height: 12),
            SectionCard(
              title: 'Payment',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _kv('Total', gbp.format((money['quoteTotal'] as num?)?.toDouble() ?? 0)),
                  _kv('Paid', gbp.format((money['paid'] as num?)?.toDouble() ?? 0)),
                  _kv('Balance due', gbp.format((money['balance'] as num?)?.toDouble() ?? 0)),
                  if (money['depositOutstanding'] != null) _kv('Deposit due', gbp.format((money['depositOutstanding'] as num).toDouble())),
                  if (payInfo.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(payInfo, style: TextStyle(color: Colors.grey.shade800, fontSize: 13)),
                  ],
                ],
              ),
            ),
            if (quote != null) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Quotation ${quote['quoteNumber']}',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Status: ${quote['status']} · ${gbp.format((quote['total'] as num?)?.toDouble() ?? 0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (quote['status'] == 'sent') ...[
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
                child: Column(
                  children: [
                    for (final b in bookings)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${(b as Map)['type']}'.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${fmtDate(b['scheduledDate'])} · ${b['slot'] ?? ''} · ${b['status']}'),
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
