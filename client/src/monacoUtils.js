export function disableMonacoDiagnostics(monaco) {
  if (!monaco) return;
  // Disable JSON validation warnings
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
  // Disable JavaScript validation warnings
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
}
