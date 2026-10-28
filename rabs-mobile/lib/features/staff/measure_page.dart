import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/meta_provider.dart';
import '../../shared/widgets.dart';

class MeasurePage extends ConsumerStatefulWidget {
  const MeasurePage({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<MeasurePage> createState() => _MeasurePageState();
}

class _MeasurePageState extends ConsumerState<MeasurePage> {
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

  Future<void> _ensureMeasurement() async {
    if (_agg?['measurement'] != null) return;
    await ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/measurement');
    await _load();
  }

  List<Map<String, dynamic>> get _rooms {
    final rooms = ((_agg?['measurement'] as Map?)?['rooms'] as List?) ?? [];
    return rooms.cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<void> _editRoom({Map<String, dynamic>? existing}) async {
    await _ensureMeasurement();
    final mid = _agg?['measurement']?['id'];
    if (mid == null) return;
    if (!mounted) return;

    final meta = await ref.read(rabsMetaProvider.future);
    if (!mounted) return;
    final roomTypes = metaRoomTypes(meta);
    final flooring = metaProducts(meta, kind: 'flooring');
    final accessories = metaProducts(meta, kind: 'accessory');

    String name = existing?['name']?.toString() ?? (roomTypes.isNotEmpty ? roomTypes.first : 'Lounge');
    String unit = existing?['unitInput']?.toString() ?? 'm';
    final wM = TextEditingController(text: '${existing?['widthM'] ?? ''}');
    final lM = TextEditingController(text: '${existing?['lengthM'] ?? ''}');
    final wFt = TextEditingController(text: '${existing?['widthFt'] ?? ''}');
    final wIn = TextEditingController(text: '${existing?['widthIn'] ?? ''}');
    final lFt = TextEditingController(text: '${existing?['lengthFt'] ?? ''}');
    final lIn = TextEditingController(text: '${existing?['lengthIn'] ?? ''}');
    final notes = TextEditingController(text: '${existing?['notes'] ?? ''}');
    String? productId = existing?['productId']?.toString();
    final selectedAcc = <String>{
      for (final a in (existing?['accessories'] as List? ?? []))
        if (a is Map && a['productId'] != null) '${a['productId']}'
    };

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 16, right: 16, top: 16),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(existing == null ? 'Add room' : 'Edit room', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: roomTypes.contains(name) ? name : null,
                      decoration: const InputDecoration(labelText: 'Room / area'),
                      items: [
                        ...roomTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))),
                        const DropdownMenuItem(value: '__custom', child: Text('Custom name…')),
                      ],
                      onChanged: (v) {
                        if (v == '__custom') {
                          // keep custom via text below
                        } else if (v != null) {
                          setLocal(() => name = v);
                        }
                      },
                    ),
                    if (!roomTypes.contains(name) || name == '__custom')
                      TextField(
                        decoration: const InputDecoration(labelText: 'Custom room name'),
                        onChanged: (v) => name = v,
                        controller: TextEditingController(text: roomTypes.contains(name) ? '' : name),
                      ),
                    const SizedBox(height: 8),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'm', label: Text('Metres')),
                        ButtonSegment(value: 'ftin', label: Text('Feet & inches')),
                      ],
                      selected: {unit},
                      onSelectionChanged: (s) => setLocal(() => unit = s.first),
                    ),
                    const SizedBox(height: 8),
                    if (unit == 'm') ...[
                      TextField(controller: lM, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Length (m)')),
                      TextField(controller: wM, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Width (m)')),
                    ] else ...[
                      Row(children: [
                        Expanded(child: TextField(controller: lFt, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Length ft'))),
                        const SizedBox(width: 8),
                        Expanded(child: TextField(controller: lIn, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'in'))),
                      ]),
                      Row(children: [
                        Expanded(child: TextField(controller: wFt, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Width ft'))),
                        const SizedBox(width: 8),
                        Expanded(child: TextField(controller: wIn, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'in'))),
                      ]),
                    ],
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: productId != null && flooring.any((p) => '${p['id']}' == productId) ? productId : null,
                      decoration: const InputDecoration(labelText: 'Floor product *'),
                      items: flooring
                          .map((p) => DropdownMenuItem(
                                value: '${p['id']}',
                                child: Text('${p['name']}${p['sellPrice'] != null ? ' · £${p['sellPrice']}' : ''}'),
                              ))
                          .toList(),
                      onChanged: (v) => setLocal(() => productId = v),
                    ),
                    const SizedBox(height: 8),
                    const Text('Accessories', style: TextStyle(fontWeight: FontWeight.w700)),
                    ...accessories.map((a) {
                      final id = '${a['id']}';
                      return CheckboxListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text('${a['name']}'),
                        value: selectedAcc.contains(id),
                        onChanged: (v) => setLocal(() {
                          if (v == true) {
                            selectedAcc.add(id);
                          } else {
                            selectedAcc.remove(id);
                          }
                        }),
                      );
                    }),
                    TextField(controller: notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Notes')),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(existing == null ? 'Save room' : 'Update room'),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (saved != true) return;
    if (productId == null || productId!.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a floor product for the room')));
      }
      return;
    }
    final body = <String, dynamic>{
      'name': name == '__custom' ? 'Room' : name.trim(),
      'unitInput': unit,
      'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
      'productId': productId,
      'accessories': selectedAcc.map((id) => {'productId': id, 'qty': 1}).toList(),
    };
    if (unit == 'm') {
      body['lengthM'] = double.tryParse(lM.text) ?? 0;
      body['widthM'] = double.tryParse(wM.text) ?? 0;
    } else {
      body['lengthFt'] = int.tryParse(lFt.text) ?? 0;
      body['lengthIn'] = double.tryParse(lIn.text) ?? 0;
      body['widthFt'] = int.tryParse(wFt.text) ?? 0;
      body['widthIn'] = double.tryParse(wIn.text) ?? 0;
    }

    setState(() => _busy = true);
    try {
      final dio = ref.read(dioProvider);
      if (existing == null) {
        await dio.rabsPost('/measurements/$mid/rooms', data: body);
      } else {
        await dio.rabsPatch('/rooms/${existing['id']}', data: body);
      }
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _photos(String roomId) async {
    final files = await ImagePicker().pickMultiImage(imageQuality: 85);
    if (files.isEmpty) return;
    setState(() => _busy = true);
    try {
      final parts = <MultipartFile>[];
      for (final f in files) {
        parts.add(await MultipartFile.fromFile(f.path, filename: f.name));
      }
      await ref.read(dioProvider).rabsUpload('/rooms/$roomId/photos', parts);
      await _load();
      if (mounted) {
        final rooms = _rooms.where((r) => '${r['id']}' == roomId);
        final n = rooms.isEmpty ? 0 : ((rooms.first['photos'] as List?) ?? []).length;
        if (n < 3) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Uploaded. Aim for 3–5 photos (currently $n).')),
          );
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createQuote() async {
    final missing = _rooms.where((r) => r['productId'] == null).map((r) => r['name']).toList();
    if (missing.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Choose a product for: ${missing.join(', ')}')),
      );
      return;
    }
    if (_rooms.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add at least one room first')));
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(dioProvider).rabsPost('/jobs/${widget.jobId}/quotes');
      if (mounted) context.push('/staff/jobs/${widget.jobId}/quote');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(title: const Text('Measure')), body: Padding(padding: const EdgeInsets.all(16), child: ErrorBanner(_error!, onRetry: _load)));
    }
    if (_agg == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final customer = _agg!['customer'] as Map?;
    final rooms = _rooms;
    final ready = rooms.isNotEmpty && rooms.every((r) => r['productId'] != null);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Measurement'),
        actions: [
          IconButton(onPressed: _busy ? null : () => _editRoom(), icon: const Icon(Icons.add)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (customer != null)
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${customer['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    Text('${_agg!['siteAddress'] ?? customer['address'] ?? ''}', style: TextStyle(color: Colors.grey.shade700)),
                    Text('${customer['phone'] ?? ''}', style: TextStyle(color: Colors.grey.shade700)),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            if (rooms.isEmpty) const EmptyState('No rooms yet. Tap + to add a room with product and sizes.'),
            for (final r in rooms)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text('${r['name']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                          if (r['productId'] == null)
                            const StatusChip(label: 'No product', colorHex: '#DC2626')
                          else
                            StatusChip(label: '${((r['photos'] as List?) ?? []).length} photos', colorHex: ((r['photos'] as List?) ?? []).length >= 3 ? '#16A34A' : '#F59E0B', textHex: '#111827'),
                        ],
                      ),
                      Text(
                        '${r['lengthM'] ?? '—'}m × ${r['widthM'] ?? '—'}m'
                        '${r['areaM2'] != null ? ' · ${r['areaM2']} m²' : ''}'
                        '${r['productName'] != null ? ' · ${r['productName']}' : ''}',
                      ),
                      if (((r['accessories'] as List?) ?? []).isNotEmpty)
                        Text(
                          ((r['accessories'] as List).map((a) => (a as Map)['name'] ?? a['productId']).join(' · ')),
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                        ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          TextButton.icon(onPressed: () => _editRoom(existing: r), icon: const Icon(Icons.edit, size: 18), label: const Text('Edit')),
                          TextButton.icon(onPressed: () => _photos('${r['id']}'), icon: const Icon(Icons.camera_alt, size: 18), label: const Text('Photos')),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: _busy ? null : () => _editRoom(), icon: const Icon(Icons.add), label: const Text('Add room')),
            const SizedBox(height: 12),
            NextActionButton(
              label: 'CREATE QUOTATION',
              busy: _busy,
              onPressed: ready ? _createQuote : null,
            ),
            if (!ready && rooms.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Every room needs a floor product before quotation.', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
              ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
