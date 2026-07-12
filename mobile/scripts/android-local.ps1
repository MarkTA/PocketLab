$env:ANDROID_HOME = "C:\Users\mark\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17.0.18"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"

Write-Host "Java:"
java -version

Write-Host "Android SDK:"
Write-Host $env:ANDROID_HOME

npx expo run:android