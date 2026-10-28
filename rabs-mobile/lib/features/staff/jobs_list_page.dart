import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../shared/widgets.dart';

class JobsListPage extends ConsumerStatefulWidget {
  const JobsListPage({super.key});

  @override
  ConsumerState<JobsListPage> createState() => _JobsListPageState();
}

class _JobsListPageState extends ConsumerState<JobsListPage> {
  List<dynamic> _jobs = [];
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
      final r = await ref.read(dioProvider).rabsGet('/jobs', query: {'limit': 100}) as Map;
      setState(() {
        _jobs = (r['data'] as List?) ?? (r['jobs'] as List?) ?? [];
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
            Text('Jobs', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _jobs.isEmpty) const EmptyState('No jobs yet. Start a new enquiry.'),
            for (final j in _jobs)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text('${(j as Map)['jobNumber']} · ${j['customerName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${j['statusLabel'] ?? j['status'] ?? ''} · ${j['address'] ?? ''}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/staff/jobs/${j['id']}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
