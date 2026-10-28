// Safe display helpers — never show raw null / "null" / internal ids to users.

String nz(dynamic v, [String fallback = '—']) {
  if (v == null) return fallback;
  final s = '$v'.trim();
  if (s.isEmpty || s == 'null' || s == 'undefined' || s == 'NaN') return fallback;
  return s;
}

String joinClean(List<dynamic> parts, {String sep = ' · '}) {
  final out = parts.map((p) => nz(p, '')).where((s) => s.isNotEmpty).toList();
  return out.isEmpty ? '—' : out.join(sep);
}

String humanStatus(dynamic codeOrLabel) {
  final s = nz(codeOrLabel, '');
  if (s.isEmpty) return 'In progress';
  if (s.contains(' ') || s != s.toUpperCase()) return s;
  return s
      .toLowerCase()
      .split('_')
      .where((w) => w.isNotEmpty)
      .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

String moneyOrDash(num? n, String Function(num) format) {
  if (n == null) return '—';
  return format(n);
}

/// User-facing explanation for the workflow next-step code from the API.
String nextActionHint(String? code) {
  switch (code) {
    case 'book_appointment':
      return 'Book a surveyor visit so rooms can be measured on site.';
    case 'start_measurement':
      return 'Record room sizes and choose flooring / accessories for this job.';
    case 'create_quote':
      return 'Build a quotation from the measured rooms — prices come from the catalogue.';
    case 'accept_quote':
      return 'Customer has agreed. Accept to lock prices and move toward deposit.';
    case 'convert_job':
      return 'Turn the accepted quote into a live job so you can take payment and book fitting.';
    case 'record_deposit':
      return 'Collect the deposit before ordering materials or booking fitters.';
    case 'check_materials':
      return 'Confirm stock for this job. Mark short items so purchasing can order them.';
    case 'book_fitting':
      return 'Pick a fitting day and assign a fitter from the diary.';
    case 'book_delivery':
      return 'Schedule furniture / goods delivery to the customer.';
    case 'open_fitting':
      return 'Open the fitting checklist, photos and customer signature on site.';
    case 'open_delivery':
      return 'Open the delivery checklist and capture proof of delivery.';
    case 'collect_balance':
      return 'Collect the remaining balance before closing the job.';
    case 'close_job':
      return 'Everything is done and paid — close the job to archive it.';
    case 'resolve_issue':
      return 'Clear the raised issue so the job can continue.';
    default:
      return 'This is the recommended next step for this job. Tap to continue.';
  }
}

String materialsStatusLabel(dynamic raw) {
  switch (nz(raw, '').toLowerCase()) {
    case 'not_checked':
      return 'Not checked yet';
    case 'pending':
      return 'Waiting on stock / orders';
    case 'ready':
      return 'Ready for fitting';
    case 'to_order':
      return 'Needs ordering';
    case 'ordered':
      return 'Ordered';
    case 'received':
      return 'Received';
    case 'used':
      return 'Used on site';
    default:
      return humanStatus(raw);
  }
}
