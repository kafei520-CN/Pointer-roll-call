# 指针点名

本地点名工具。网页、桌面、Android、iOS 共用同一套前端。名单、模板和点名记录都写在本机 IndexedDB，不会上传。

## 使用流程

1. **新建表模板**：导入 Excel（xlsx / xls / xlsm）或从空白模板开始。
2. **编辑**：改名称、增删人员、用底部标签管理多个工作表（类似 Excel 分页）。
3. **保存模板**：模板出现在「模板 / 已保存」。
4. **从模板新建表**：给这次点名命名后开始点。
5. **使用**：点「到 / 缺 / 假 / 迟」，支持中文、拼音、首字母搜索。
6. **关闭**：进入「历史」。下次从历史打开可查看或继续。

导入时可勾选工作表，并用行号指定表头行、起始行、结束行和姓名列。点预览左侧行号可把该行设为表头或起止行。

在微信、QQ 或其他应用里打开 / 分享 xlsx 时，选「指针点名」，会直接进入导入界面。

## 网页

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:1420`。示例名单：`public/sample-class.xlsx`（`npm run sample` 可重新生成）。

## 桌面（Tauri）

```bash
npm run tauri dev
```

## Android

需要 JDK 17+、Android SDK、NDK。本机已初始化工程。

打好的安装包：

`release/指针点名-0.1.0-arm64-debug.apk`

这是 ARM64 debug 包，可用爱思助手或 `adb install` 装到手机。包名 `com.zhizhen.dianming`。

重新打包（项目路径含中文时，请先复制到纯英文目录再编）：

```bash
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set NDK_HOME=%ANDROID_HOME%\ndk\29.0.13846066
npm run tauri android init
npm run tauri android build -- --debug --apk --target aarch64
```

## iOS

需要 macOS 与 Xcode：

```bash
npm run tauri ios init
npm run tauri ios dev
```

## GitHub Actions

仓库只打 Android 与 iOS。推送到 `main`、开 PR，或在 Actions 里手动 Run workflow。

- Android：`ubuntu-latest`，ARM64 debug APK，产物名 `android-apk`
- iOS：`macos-latest`，debug IPA，产物名 `ios-ipa`

iOS 签名需要 Apple 开发者证书。未配置证书时，iOS 任务可能失败；Android 不受影响。

## 测试

```bash
npm test
```

