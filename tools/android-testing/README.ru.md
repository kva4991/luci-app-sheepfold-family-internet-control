# Ручной Android-стенд Sheepfold

<!-- §andlab1 -->

Эти сценарии устанавливают и запускают отдельные AVD только по явной команде.
Каноническая архитектура, матрица тестов, физические телефоны и ограничения
эмулятора описаны в [`../../docs/android-test-lab.ru.md`](../../docs/android-test-lab.ru.md).

Быстрая проверка без запуска эмулятора:

```powershell
npm.cmd run androidLab:doctor
```

Однократная установка тяжёлых system images:

```powershell
npm.cmd run androidLab:setup -- -Install -AcceptAndroidLicenses
```

Ручной smoke на API 35 и полный последовательный проход API 28/35:

```powershell
npm.cmd run androidLab:smoke
npm.cmd run androidLab:full
```

Сценарии не входят в `npm.cmd test` и не трогают роутер. Отчёты сохраняются в
`SHEEPFOLD_SCRIPT_SCRATCH_ROOT`, в `Documents\pesochnica` на текущем компьютере
или в `.build/android-lab`, если внешний scratch недоступен.
