import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/meta_provider.dart';
import '../../shared/widgets.dart';

class QuotePage extends ConsumerStatefulWidget {
  const QuotePage({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<QuotePage> createState() => _QuotePageState();
}

class _QuotePageState extends ConsumerState<QuotePage> {
  Map<String, dynamic>? _agg;
  String? _error;
  bool _busy = false;
  final _productSearch = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _productSearch.dispose();
    super.dispose();
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

  Future<void> _ensureQuote() async {
    if (_agg?['currentQuote']?['quote'] != null) return;
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/quotes');
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _post(String path, [String? msg, Map<String, dynamic>? data]) async {
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).rabsPost(path, data: data ?? {});
      if (msg != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _patchLine(String quoteId, String lineId, Map<String, dynamic> body) async {
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).rabsPatch('/quotes/$quoteId/lines/$lineId', data: body);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editLine(Map line, String quoteId) async {
    final qtyCtrl = TextEditingController(text: '${line['qty'] ?? 1}');
    final priceCtrl = TextEditingController(text: '${line['unitPrice'] ?? 0}');
    final reasonCtrl = TextEditingController();
    final descCtrl = TextEditingController(text: '${line['description'] ?? ''}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit line'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description')),
              TextField(controller: qtyCtrl, decoration: const InputDecoration(labelText: 'Qty'), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
              if (ref.read(authProvider).user?.can('view_prices') == true)
                TextField(controller: priceCtrl, decoration: const InputDecoration(labelText: 'Unit price £'), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
              TextField(controller: reasonCtrl, decoration: const InputDecoration(labelText: 'Override reason (if below min)')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final body = <String, dynamic>{
      'qty': double.tryParse(qtyCtrl.text.trim()) ?? line['qty'],
      'description': descCtrl.text.trim(),
    };
    if (ref.read(authProvider).user?.can('view_prices') == true) {
      body['unitPrice'] = double.tryParse(priceCtrl.text.trim()) ?? line['unitPrice'];
      if (reasonCtrl.text.trim().isNotEmpty) body['overrideReason'] = reasonCtrl.text.trim();
    }
    await _patchLine(quoteId, '${line['id']}', body);
  }

  Future<void> _addCustomLine(String quoteId) async {
    final desc = TextEditingController();
    final qty = TextEditingController(text: '1');
    final price = TextEditingController(text: '0');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add custom line'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Use this for extras that are not in the catalogue (e.g. disposal, special trim).',
                style: TextStyle(color: Colors.grey.shade700, height: 1.35, fontSize: 13),
              ),
              const SizedBox(height: 12),
              TextField(controller: desc, decoration: const InputDecoration(labelText: 'What is this line?', hintText: 'e.g. Uplift & dispose old carpet')),
              const SizedBox(height: 10),
              TextField(controller: qty, decoration: const InputDecoration(labelText: 'Quantity'), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
              const SizedBox(height: 10),
              TextField(controller: price, decoration: const InputDecoration(labelText: 'Unit price (£)', helperText: 'Sell price the customer pays'), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add line')),
        ],
      ),
    );
    if (ok != true) return;
    if (desc.text.trim().length < 2) {
      await showBusySnack(context, 'Enter a description for the line', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).rabsPost('/quotes/$quoteId/lines', data: {
        'description': desc.text.trim(),
        'qty': double.tryParse(qty.text.trim()) ?? 1,
        'unitPrice': double.tryParse(price.text.trim()) ?? 0,
      });
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addProductLine(String quoteId, Map<String, dynamic> product) async {
    final qty = TextEditingController(text: '1');
    final price = TextEditingController(text: '${product['sellPrice'] ?? 0}');
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${product['name']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: qty, decoration: const InputDecoration(labelText: 'Qty'), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            TextField(controller: price, decoration: InputDecoration(
              labelText: 'Unit price £',
              helperText: product['minSellPrice'] != null ? 'Min £${product['minSellPrice']}' : null,
            ), keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            TextField(controller: reason, decoration: const InputDecoration(labelText: 'Override reason (admin, if below min)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final body = <String, dynamic>{
        'productId': '${product['id']}',
        'description': product['name'],
        'qty': double.tryParse(qty.text.trim()) ?? 1,
        'unitPrice': double.tryParse(price.text.trim()) ?? product['sellPrice'] ?? 0,
      };
      if (reason.text.trim().isNotEmpty) body['overrideReason'] = reason.text.trim();
      await ref.read(dioProvider).rabsPost('/quotes/$quoteId/lines', data: body);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showProductPicker(String quoteId) async {
    final meta = await ref.read(rabsMetaProvider.future);
    final products = metaProducts(meta);
    _productSearch.clear();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final q = _productSearch.text.trim().toLowerCase();
            final filtered = products.where((p) {
              if (q.isEmpty) return true;
              final hay = '${p['name']} ${p['code']} ${p['category']} ${p['colour']}'.toLowerCase();
              return hay.contains(q);
            }).take(40).toList();
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.7,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: TextField(
                        controller: _productSearch,
                        autofocus: true,
                        decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Search products'),
                        onChanged: (_) => setLocal(() {}),
                      ),
                    ),
                    Expanded(
                      child: ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (_, i) {
                          final p = filtered[i];
                          return ListTile(
                            title: Text('${p['name']}'),
                            subtitle: Text('${p['code'] ?? ''} · ${p['category'] ?? ''} · ${p['kind'] ?? ''}'),
                            trailing: Text(gbp.format((p['sellPrice'] as num?)?.toDouble() ?? 0)),
                            onTap: () {
                              Navigator.pop(ctx);
                              _addProductLine(quoteId, p);
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _confirmPost(String path, String title, String body, String success) async {
    final ok = await confirmAction(context, title: title, body: body, confirmLabel: title);
    if (!ok) return;
    await _post(path, success);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Quote')), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_agg == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final cq = _agg!['currentQuote'] as Map?;
    final quote = cq?['quote'] as Map?;
    final lines = (cq?['lines'] as List?) ?? [];
    final draft = quote?['status'] == 'draft';

    return Scaffold(
      appBar: AppBar(
        title: Text(quote == null ? 'Quotation' : nz(quote['quoteNumber'], 'Quotation')),
        actions: [
          if (quote == null) IconButton(tooltip: 'Create quotation', onPressed: _busy ? null : _ensureQuote, icon: const Icon(Icons.add)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (quote == null) ...[
            const EmptyState(
              'No quotation yet',
              hint: 'Finish measuring rooms first, then create the quote from those sizes.',
              icon: Icons.request_quote_outlined,
            ),
            FilledButton(onPressed: _busy ? null : _ensureQuote, child: const Text('Create quotation from measurement')),
          ] else ...[
            const GuideBanner(
              title: 'Quotation workflow',
              body: 'Edit lines while Draft → Send to customer → Accept when they agree. Tap a line to change qty or price.',
              icon: Icons.edit_note_outlined,
            ),
            const SizedBox(height: 12),
            StatusChip(
              label: humanStatus(quote['status']),
              colorHex: quote['status'] == 'accepted'
                  ? '#16A34A'
                  : quote['status'] == 'sent'
                      ? '#F59E0B'
                      : '#D1D5DB',
              textHex: quote['status'] == 'draft' ? '#111827' : '#FFFFFF',
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Lines',
              subtitle: draft ? 'Tap a line to edit' : 'Locked for this version',
              child: Column(
                children: [
                  if (lines.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text('No lines yet — add a product or custom line below.'),
                    ),
                  for (final line in lines)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      onTap: draft && user?.can('quotes') == true ? () => _editLine(line as Map, '${quote['id']}') : null,
                      title: Text(nz((line as Map)['description'], 'Line'), style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('Qty ${nz(line['qty'], '1')} × ${gbp.format((line['unitPrice'] as num?)?.toDouble() ?? 0)}'),
                      trailing: Text(gbp.format((line['lineTotal'] as num?)?.toDouble() ?? 0), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  const Divider(),
                  _kv('Total', gbp.format((quote['total'] as num?)?.toDouble() ?? 0)),
                  if (user?.can('view_costs') == true && quote['costTotal'] != null) _kv('Cost (internal)', gbp.format((quote['costTotal'] as num).toDouble())),
                ],
              ),
            ),
            if (draft && user?.can('quotes') == true) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: OutlinedButton.icon(onPressed: _busy ? null : () => _showProductPicker('${quote['id']}'), icon: const Icon(Icons.search), label: const Text('Add product'))),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton.icon(onPressed: _busy ? null : () => _addCustomLine('${quote['id']}'), icon: const Icon(Icons.add), label: const Text('Custom line'))),
                ],
              ),
            ],
            const SizedBox(height: 16),
            if (draft && user?.can('quotes') == true)
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _confirmPost(
                          '/quotes/${quote['id']}/send',
                          'Send to customer',
                          'Marks this quotation as sent. The customer can then review it in the portal (and email if SMTP is configured).',
                          'Quote sent to customer',
                        ),
                child: const Text('Send to customer'),
              ),
            if ((quote['status'] == 'draft' || quote['status'] == 'sent') && user?.can('accept') == true) ...[
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _confirmPost(
                          '/quotes/${quote['id']}/accept',
                          'Accept quote',
                          'Locks prices and moves the job toward deposit. Only do this when the customer has agreed.',
                          'Quote accepted',
                        ),
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
                child: const Text('Accept quote'),
              ),
            ],
            if (quote['status'] == 'sent' && user?.can('quotes') == true) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _confirmPost(
                          '/quotes/${quote['id']}/decline',
                          'Decline quote',
                          'Marks the quotation as declined by the customer.',
                          'Quote declined',
                        ),
                child: const Text('Decline'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _confirmPost(
                          '/quotes/${quote['id']}/revise',
                          'Start a revision',
                          'Creates a new draft version so you can change lines without losing the old quote.',
                          'Revision started',
                        ),
                child: const Text('Revise'),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [Expanded(child: Text(k)), Text(v, style: const TextStyle(fontWeight: FontWeight.w800))]),
      );
}
