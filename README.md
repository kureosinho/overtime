# Overtime

Suivi Rocket League : tes games (PC) et les matchs pros (PC + Android).

- `app/` : moteur Go + interface web (embarquée dans l'exe et dans l'APK)
- `android/` : app Android (WebView qui lance le moteur en mode `-mobile`)
- `.github/workflows/build.yml` : à chaque push sur `main`, GitHub construit `Overtime.apk` et `Overtime.exe` et les publie dans **Releases**.
