import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class DiaryPage extends ConsumerStatefulWidget {
  const DiaryPage({super.key});

  @override
  ConsumerState<DiaryPage> createState() => _DiaryPageState();
}

class _DiaryPageState extends ConsumerState<DiaryPage> {
  List<dynamic> _rows = [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final from = DateTime.now().subtract(const Duration(days: 1));
      final to = DateTime.now().add(const Duration(days: 21));
      final data = await ref.read(dioProvider).rabsGet('/appointments', query: {
        'from': DateFormat('yyyy-MM-dd').format(from),
        'to': DateFormat('yyyy-MM-dd').format(to),
      });
      setState(() {
        _rows = data is List ? data : [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = apiErrorMessage(e);
        _loading = false;
      });
    }
  }

  Map<String, List<dynamic>> _byDay() {
    final map = <String, List<dynamic>>{};
    for (final a in _rows) {
      final when = DateTime.tryParse('${(a as Map)['scheduledAt']}');
      final key = when != null ? DateFormat('yyyy-MM-dd').format(when) : 'unknown';
      map.putIfAbsent(key, () => []).add(a);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _byDay();
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const BrandHeader(subtitle: 'Survey visits for the next three weeks'),
            const SizedBox(height: 12),
            const GuideBanner(
              title: 'Using the diary',
              body: 'Tap an appointment to open the job. Book new visits from the job’s NEXT STEP when status asks for an appointment.',
              icon: Icons.event_available_outlined,
            ),
            const SizedBox(height: 12),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _rows.isEmpty)
              const EmptyState(
                'No appointments booked',
                hint: 'Open a new enquiry job and use NEXT STEP → Book appointment.',
                icon: Icons.event_busy_outlined,
              ),
            for (final entry in grouped.entries) ...[
              Padding(
                padding: const EdgeInsets.only(top: 10, bottom: 6),
                child: Text(fmtDate(entry.key), style: const TextStyle(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
              ),
              for (final a in entry.value)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(nz((a as Map)['customerName'], 'Customer'), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(joinClean([
                      fmtDateTime(a['scheduledAt']),
                      humanStatus(a['purpose']),
                      a['staffName'] ?? 'Unassigned',
                      a['jobNumber'],
                    ])),
                    trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
                    onTap: a['jobId'] != null ? () => context.push('/staff/jobs/${a['jobId']}') : null,
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
