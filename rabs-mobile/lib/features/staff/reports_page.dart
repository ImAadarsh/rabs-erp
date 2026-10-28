import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../shared/widgets.dart';

class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  String _tab = 'pipeline';
  dynamic _data;
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
      final path = switch (_tab) {
        'sales' => '/reports/sales',
        'outstanding' => '/reports/outstanding',
        'schedule' => '/reports/schedule',
        'purchasing' => '/reports/purchasing',
        _ => '/reports/pipeline',
      };
      final d = await ref.read(dioProvider).rabsGet(path);
      setState(() {
        _data = d;
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
    final can = ref.watch(authProvider).user?.can('reports') == true;
    if (!can) {
      return const SafeArea(child: EmptyState('You do not have access to reports.'));
    }
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Reports', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final t in ['pipeline', 'sales', 'outstanding', 'schedule', 'purchasing'])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(t[0].toUpperCase() + t.substring(1)),
                      selected: _tab == t,
                      onSelected: (_) {
                        setState(() => _tab = t);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
          if (!_loading && _data != null) _render(_data),
        ],
      ),
    );
  }

  Widget _render(dynamic data) {
    if (data is List) {
      if (data.isEmpty) return const EmptyState('Nothing to show.');
      return Column(
        children: [
          for (final row in data)
            Card(
              child: ListTile(
                title: Text('${(row as Map)['label'] ?? row['customerName'] ?? row['jobNumber'] ?? row['description'] ?? row}'),
                subtitle: Text('${row['status'] ?? row['staffName'] ?? row['month'] ?? ''}'),
                trailing: Text('${row['count'] ?? row['total'] ?? row['amount'] ?? row['qtyRequired'] ?? ''}'),
              ),
            ),
        ],
      );
    }
    if (data is Map) {
      return SectionCard(child: Text(data.toString(), style: const TextStyle(fontSize: 12)));
    }
    return Text('$data');
  }
}
