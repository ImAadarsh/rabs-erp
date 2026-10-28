import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme.dart';

final gbp = NumberFormat.currency(locale: 'en_GB', symbol: '£');

String fmtDate(dynamic v) {
  if (v == null) return '—';
  final d = v is DateTime ? v : DateTime.tryParse('$v');
  if (d == null) return '—';
  return DateFormat('EEE d MMM yyyy').format(d);
}

String fmtDateTime(dynamic v) {
  if (v == null) return '—';
  final d = v is DateTime ? v : DateTime.tryParse('$v');
  if (d == null) return '—';
  return DateFormat('EEE d MMM · HH:mm').format(d);
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, this.colorHex, this.textHex});
  final String label;
  final String? colorHex;
  final String? textHex;

  @override
  Widget build(BuildContext context) {
    final bg = RabsTheme.statusColor(colorHex);
    final fg = RabsTheme.statusColor(textHex, fallback: Colors.white);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.steps, required this.index});
  final List<String> steps;
  final int index;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0) Container(width: 12, height: 2, color: i <= index ? RabsTheme.brand : Colors.grey.shade300),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: i <= index ? RabsTheme.brand : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                steps[i],
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: i <= index ? Colors.white : Colors.grey.shade600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class NextActionButton extends StatelessWidget {
  const NextActionButton({super.key, required this.label, required this.onPressed, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF111827),
        minimumSize: const Size.fromHeight(56),
      ),
      child: busy
          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : Text('NEXT: $label', style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.3)),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.message, {super.key});
  final String message;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Center(
        child: Text(message, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600)),
      ),
    );
  }
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFEE2E2),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(child: Text(message, style: const TextStyle(color: Color(0xFFB91C1C)))),
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

Future<void> launchPhone(String? phone) async {
  if (phone == null || phone.trim().isEmpty) return;
  final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'\s'), ''));
  await launchUrl(uri);
}

Future<void> launchMaps(String? address) async {
  if (address == null || address.trim().isEmpty) return;
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(address)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.title, this.padding});
  final Widget child;
  final String? title;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding ?? const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Text(title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}
