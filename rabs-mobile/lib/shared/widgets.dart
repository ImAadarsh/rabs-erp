import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/theme.dart';
import 'display.dart';

export 'display.dart';

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

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 48, this.compact = false});
  final double height;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      compact ? RabsBrand.logoCompact : RabsBrand.logo,
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Text(
        RabsBrand.shortName,
        style: TextStyle(fontWeight: FontWeight.w900, fontSize: height * 0.55, color: RabsTheme.brandDark),
      ),
    );
  }
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key, required this.subtitle, this.trailing});
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const BrandLogo(height: 40, compact: true),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(RabsBrand.shortName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: RabsTheme.brandDark)),
              Text(subtitle, style: TextStyle(color: Colors.grey.shade700, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class GuideBanner extends StatelessWidget {
  const GuideBanner({super.key, required this.title, required this.body, this.icon = Icons.lightbulb_outline});
  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [RabsTheme.brand.withValues(alpha: 0.08), RabsTheme.gold.withValues(alpha: 0.12)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: RabsTheme.brand.withValues(alpha: 0.15)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: RabsTheme.brandDark, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: RabsTheme.ink)),
                const SizedBox(height: 4),
                Text(body, style: TextStyle(height: 1.35, color: Colors.grey.shade800, fontSize: 13.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(humanStatus(label), style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 12)),
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
            if (i > 0) Container(width: 10, height: 2, color: i <= index ? RabsTheme.brand : Colors.grey.shade300),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: i <= index ? RabsTheme.brand : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                steps[i],
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: i <= index ? Colors.white : Colors.grey.shade700,
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
  const NextActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.hint,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (hint != null && hint!.trim().isNotEmpty) ...[
          GuideBanner(title: 'What happens next', body: hint!, icon: Icons.flag_outlined),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed: busy ? null : onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: RabsTheme.brandDark,
            minimumSize: const Size.fromHeight(58),
          ),
          child: busy
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('NEXT STEP', style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w700, color: Color(0xFFFFE8A3))),
                    const SizedBox(height: 2),
                    Text(label, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                  ],
                ),
        ),
      ],
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.message, {super.key, this.hint, this.icon = Icons.inbox_outlined});
  final String message;
  final String? hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(icon, size: 40, color: RabsTheme.brand.withValues(alpha: 0.45)),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: RabsTheme.ink)),
            if (hint != null) ...[
              const SizedBox(height: 8),
              Text(hint!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade700, height: 1.35)),
            ],
          ],
        ),
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
            const Icon(Icons.error_outline, color: Color(0xFFB91C1C)),
            const SizedBox(width: 10),
            Expanded(child: Text(nz(message, 'Something went wrong'), style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600))),
            if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

Future<void> launchPhone(String? phone) async {
  final p = nz(phone, '');
  if (p.isEmpty) return;
  final uri = Uri(scheme: 'tel', path: p.replaceAll(RegExp(r'\s'), ''));
  await launchUrl(uri);
}

Future<void> launchMaps(String? address) async {
  final a = nz(address, '');
  if (a.isEmpty) return;
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(a)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.title, this.subtitle, this.padding});
  final Widget child;
  final String? title;
  final String? subtitle;
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
              Text(title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: RabsTheme.ink)),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, style: TextStyle(color: Colors.grey.shade700, fontSize: 13, height: 1.3)),
              ],
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// Confirm before an important / irreversible action. Returns false if cancelled.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Continue',
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      content: Text(body, style: const TextStyle(height: 1.4)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C)) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok == true;
}

Future<void> showBusySnack(BuildContext context, String message, {bool error = false}) async {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: error ? const Color(0xFFB91C1C) : RabsTheme.charcoal,
    ),
  );
}
