// Временная проверка синтаксиса app.js (WSH/JScript)
var fso = new ActiveXObject("Scripting.FileSystemObject");
var path = fso.GetParentFolderName(WScript.ScriptFullName);
path = fso.BuildPath(fso.GetParentFolderName(path), "js\\app.js");
var ts = fso.OpenTextFile(path, 1, false, 0); // 0 = ASCII/кодировка по умолчанию
var src = ts.ReadAll();
ts.Close();
try {
  new Function(src);
  WScript.Echo("SYNTAX OK");
} catch (e) {
  WScript.Echo("SYNTAX ERROR: " + e.message);
  WScript.Exit(1);
}
