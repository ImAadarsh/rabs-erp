import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  static const _tabs = [
    ('pipeline', 'Pipeline', 'Jobs by status'),
    ('sales', 'Sales', 'Accepted quotes & split'),
    ('outstanding', 'Outstanding', 'Balances still due'),
    ('schedule', 'Schedule', 'Fitting & delivery diary'),
    ('purchasing', 'Purchasing', 'Materials to order'),
  ];

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
    final canCosts = ref.watch(authProvider).user?.can('view_costs') == true;
    if (!can) {
      return const SafeArea(
        child: EmptyState(
          'Reports are for office / managers',
          hint: 'Ask an admin to give you the reports permission.',
          icon: Icons.lock_outline,
        ),
      );
    }
    final tabMeta = _tabs.firstWhere((t) => t.$1 == _tab);
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const BrandHeader(subtitle: 'Numbers that help you run the week'),
            const SizedBox(height: 12),
            GuideBanner(
              title: tabMeta.$2,
              body: tabMeta.$3,
              icon: Icons.insights_outlined,
            ),
            const SizedBox(height: 14),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final t in _tabs)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(t.$2, style: TextStyle(fontWeight: _tab == t.$1 ? FontWeight.w800 : FontWeight.w600)),
                        selected: _tab == t.$1,
                        selectedColor: RabsTheme.brand.withValues(alpha: 0.15),
                        checkmarkColor: RabsTheme.brandDark,
                        onSelected: (_) {
                          setState(() => _tab = t.$1);
                          _load();
                        },
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _data != null) ...[
              if (_tab == 'pipeline') _pipeline(_data),
              if (_tab == 'sales') _sales(_data, canCosts),
              if (_tab == 'outstanding') _outstanding(_data),
              if (_tab == 'schedule') _schedule(_data),
              if (_tab == 'purchasing') _purchasing(_data),
            ],
          ],
        ),
      ),
    );
  }

  Widget _pipeline(dynamic data) {
    final rows = data is List ? data : (data is Map ? (data['byStatus'] as List? ?? data['data'] as List? ?? []) : <dynamic>[]);
    if (rows.isEmpty) {
      return const EmptyState('No jobs in the pipeline yet', hint: 'Create an enquiry from Home → New enquiry.');
    }
    return SectionCard(
      title: 'Jobs by status',
      subtitle: 'Tap a row to open the jobs list',
      child: Column(
        children: [
          for (final row in rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(humanStatus((row as Map)['label'] ?? row['status']), style: const TextStyle(fontWeight: FontWeight.w700)),
              trailing: _badge('${row['count'] ?? 0}'),
              onTap: () => context.go('/staff/jobs'),
            ),
        ],
      ),
    );
  }

  Widget _sales(dynamic raw, bool canCosts) {
    if (raw is! Map) return const EmptyState('No sales data');
    final data = Map<String, dynamic>.from(raw);
    final totals = Map<String, dynamic>.from((data['totals'] as Map?) ?? {});
    final split = Map<String, dynamic>.from((data['split'] as Map?) ?? {});
    final conversion = Map<String, dynamic>.from((data['conversion'] as Map?) ?? {});
    final byMonth = (data['byMonth'] as List?) ?? [];
    final byStaff = (data['byStaff'] as List?) ?? [];
    final byCategory = (data['byCategory'] as List?) ?? [];
    final from = nz(data['from']);
    final to = nz(data['to']);

    return Column(
      children: [
        SectionCard(
          title: 'Period totals',
          subtitle: '$from → $to',
          child: Column(
            children: [
              _metric('Accepted quotes', '${totals['quotes'] ?? 0}'),
              _metric('Gross sales', gbp.format((totals['gross'] as num?)?.toDouble() ?? 0)),
              _metric('Net (ex VAT)', gbp.format((totals['net'] as num?)?.toDouble() ?? 0)),
              if (canCosts && totals['margin'] != null) _metric('Margin', gbp.format((totals['margin'] as num).toDouble())),
              _metric('Conversion', '${conversion['accepted'] ?? 0} accepted of ${conversion['quoted'] ?? 0} quoted'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Furniture vs carpet / flooring',
          subtitle: 'Sales split from quote lines',
          child: Column(
            children: [
              _metric('Carpet & flooring', gbp.format((split['carpetFlooring'] as num?)?.toDouble() ?? 0)),
              _metric('Furniture', gbp.format((split['furniture'] as num?)?.toDouble() ?? 0)),
            ],
          ),
        ),
        if (byCategory.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'By product group',
            child: Column(
              children: [
                for (final c in byCategory)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(humanStatus((c as Map)['salesGroup'] ?? c['kind']), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${c['quotes'] ?? 0} quotes'),
                    trailing: Text(gbp.format((c['gross'] as num?)?.toDouble() ?? 0), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
              ],
            ),
          ),
        ],
        if (byMonth.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'By month',
            child: Column(
              children: [
                for (final m in byMonth)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(nz((m as Map)['month']), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${m['quotes'] ?? 0} quotes'),
                    trailing: Text(gbp.format((m['gross'] as num?)?.toDouble() ?? 0), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
              ],
            ),
          ),
        ],
        if (byStaff.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'By staff',
            child: Column(
              children: [
                for (final s in byStaff)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(nz((s as Map)['name'], 'Unassigned'), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${s['quotes'] ?? 0} quotes'),
                    trailing: Text(gbp.format((s['gross'] as num?)?.toDouble() ?? 0), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _outstanding(dynamic raw) {
    final rows = raw is Map ? ((raw['data'] as List?) ?? []) : (raw is List ? raw : <dynamic>[]);
    final total = raw is Map ? (raw['total'] as num?)?.toDouble() ?? 0 : 0.0;
    if (rows.isEmpty) {
      return const EmptyState('Nothing outstanding', hint: 'All converted jobs are fully paid — nice work.', icon: Icons.check_circle_outline);
    }
    return Column(
      children: [
        SectionCard(
          title: 'Total still owed',
          child: Text(gbp.format(total), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Jobs with a balance',
          subtitle: 'Tap to open the job and collect payment',
          child: Column(
            children: [
              for (final j in rows)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(joinClean([(j as Map)['jobNumber'], j['customerName']]), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(joinClean([humanStatus(j['statusLabel'] ?? j['status']), j['address'] ?? j['siteAddress']])),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(gbp.format((j['balance'] as num?)?.toDouble() ?? 0), style: const TextStyle(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
                      Text('due', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                    ],
                  ),
                  onTap: j['id'] != null ? () => context.push('/staff/jobs/${j['id']}') : null,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _schedule(dynamic raw) {
    final rows = raw is Map ? ((raw['data'] as List?) ?? []) : (raw is List ? raw : <dynamic>[]);
    final from = raw is Map ? nz(raw['from']) : '';
    final to = raw is Map ? nz(raw['to']) : '';
    if (rows.isEmpty) {
      return EmptyState('Nothing scheduled', hint: from.isEmpty ? 'No fittings or deliveries in range.' : 'No bookings between $from and $to.');
    }
    return SectionCard(
      title: 'Fitting & delivery',
      subtitle: from.isEmpty ? 'Upcoming bookings' : '$from → $to',
      child: Column(
        children: [
          for (final b in rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(joinClean([(b as Map)['customerName'], humanStatus(b['type'])]), style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(joinClean([fmtDate(b['scheduledDate']), b['slot'], b['staffName'] ?? 'Unassigned', b['jobNumber']])),
              trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
              onTap: b['jobId'] != null ? () => context.push('/staff/jobs/${b['jobId']}') : null,
            ),
        ],
      ),
    );
  }

  Widget _purchasing(dynamic raw) {
    final rows = raw is List ? raw : (raw is Map ? (raw['data'] as List? ?? []) : <dynamic>[]);
    if (rows.isEmpty) {
      return const EmptyState('Nothing to order', hint: 'When materials are short, they appear here for purchasing.', icon: Icons.inventory_2_outlined);
    }
    return SectionCard(
      title: 'Materials to chase',
      subtitle: 'Mark ordered from the job screen after purchasing',
      child: Column(
        children: [
          for (final m in rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(nz((m as Map)['description'], 'Material'), style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(joinClean([
                m['jobNumber'],
                m['customerName'],
                materialsStatusLabel(m['status']),
                m['neededBy'] != null ? 'needed ${fmtDate(m['neededBy'])}' : '',
              ])),
              trailing: Text('×${nz(m['qtyRequired'] ?? m['qtyShort'], '?')}', style: const TextStyle(fontWeight: FontWeight.w900)),
              onTap: m['jobId'] != null ? () => context.push('/staff/jobs/${m['jobId']}') : null,
            ),
        ],
      ),
    );
  }

  Widget _metric(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(label, style: TextStyle(color: Colors.grey.shade800))),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      );

  Widget _badge(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: RabsTheme.brand.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
      );
}
