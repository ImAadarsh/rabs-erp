import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
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

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Diary', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _rows.isEmpty) const EmptyState('No appointments in the next three weeks.'),
            for (final a in _rows)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text('${(a as Map)['customerName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${fmtDateTime(a['scheduledAt'])} · ${a['purpose'] ?? ''} · ${a['jobNumber'] ?? ''}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: a['jobId'] != null ? () => context.push('/staff/jobs/${a['jobId']}') : null,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
