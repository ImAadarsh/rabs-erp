import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class FieldHomePage extends ConsumerStatefulWidget {
  const FieldHomePage({super.key, this.embeddedInStaff = false});
  final bool embeddedInStaff;

  @override
  ConsumerState<FieldHomePage> createState() => _FieldHomePageState();
}

class _FieldHomePageState extends ConsumerState<FieldHomePage> {
  String _scope = 'today';
  List<dynamic>? _rows;
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
      final dio = ref.read(dioProvider);
      final data = await dio.rabsGet('/my-work', query: {'scope': _scope});
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

  String _workPath(Map w) {
    final jobId = '${w['jobId']}';
    final id = '${w['id']}';
    return widget.embeddedInStaff ? '/staff/jobs/$jobId/work/$id' : '/field/jobs/$jobId/work/$id';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final body = RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!widget.embeddedInStaff) ...[
            Row(
              children: [
                Expanded(
                  child: Text('My work', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                ),
                IconButton(
                  tooltip: 'Sign out',
                  onPressed: () => ref.read(authProvider.notifier).logout(),
                  icon: const Icon(Icons.logout),
                ),
              ],
            ),
            Text('Hi ${user?.displayName ?? ''}', style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 12),
          ],
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'today', label: Text('Today')),
              ButtonSegment(value: 'upcoming', label: Text('Upcoming')),
              ButtonSegment(value: 'all', label: Text('All')),
            ],
            selected: {_scope},
            onSelectionChanged: (s) {
              setState(() => _scope = s.first);
              _load();
            },
          ),
          const SizedBox(height: 16),
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (_loading)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
          else if ((_rows ?? []).isEmpty)
            EmptyState(_scope == 'today' ? 'Nothing booked for you today.' : 'No jobs assigned to you.')
          else
            ..._groupByDay(_rows!).entries.expand((e) => [
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 6),
                    child: Text(fmtDate(e.key), style: TextStyle(fontWeight: FontWeight.w800, color: Colors.grey.shade600, fontSize: 13)),
                  ),
                  ...e.value.map((w) => _WorkCard(work: w, onTap: () => context.push(_workPath(w as Map)))),
                ]),
        ],
      ),
    );

    if (widget.embeddedInStaff) return body;
    return Scaffold(body: SafeArea(child: body));
  }

  Map<String, List<dynamic>> _groupByDay(List rows) {
    final map = <String, List<dynamic>>{};
    for (final r in rows) {
      final d = '${(r as Map)['scheduledDate']}'.substring(0, 10);
      map.putIfAbsent(d, () => []).add(r);
    }
    return map;
  }
}

class _WorkCard extends StatelessWidget {
  const _WorkCard({required this.work, required this.onTap});
  final dynamic work;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final w = work as Map;
    final fitting = w['type'] == 'fitting';
    final status = '${w['status'] ?? ''}';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: fitting ? RabsTheme.brand.withValues(alpha: 0.15) : Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(fitting ? Icons.handyman : Icons.local_shipping, color: fitting ? RabsTheme.brand : Colors.blue.shade700),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('${w['customerName']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16), overflow: TextOverflow.ellipsis)),
                        StatusChip(
                          label: status.replaceAll('_', ' '),
                          colorHex: status == 'complete'
                              ? '#16A34A'
                              : status == 'in_progress'
                                  ? '#F59E0B'
                                  : '#2563EB',
                        ),
                      ],
                    ),
                    Text(
                      '${w['type']} · ${w['slot'] ?? 'Any time'} · ${w['jobNumber']}',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                    ),
                    if (w['address'] != null)
                      Text('${w['address']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
