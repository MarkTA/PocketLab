$env:ANDROID_HOME = "C:\Users\mark\AppData\Local\Android\Sdk"
$emulator = "$env:ANDROID_HOME\emulator\emulator.exe"

& $emulator -avd Medium_Phone