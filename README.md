# 点移 PointShift

一个基于 `transfer.py` 的离线三维坐标变换应用，使用同一套 React Native / Expo 代码面向 iOS 和 Android。

输入 A、B、C 三个参考点变换前后的坐标，以及目标点 D 的初始坐标，计算 D 的新坐标。计算在设备本地完成，无需 Python 服务、账号或网络连接。原始 `transfer.py` 保留为数值对照基准。

## 使用流程

1. 填写 A1、B1、C1 与 A2、B2、C2，确保同名点对应同一物理点。
2. 填写目标点 D1，所有坐标使用相同单位。
3. 点击计算，查看 D2、参考点拟合误差、旋转矩阵 R 和平移向量 t。
4. 在空间或平面视图中检查点位关系；按需复制或分享结果，或从本地记录恢复输入。

界面提供中文坐标表单、示例数据、空间/XY/XZ/YZ 预览、结果复制与 JSON 分享、草稿恢复及最近 30 条本地计算记录。手机使用单列布局，平板和桌面预览使用更宽的工作台布局。

单位选择 `mm`、`cm`、`m` 仅为数据添加单位标记，不会换算已经输入的数值。切换单位时，应自行确认所有数据使用同一个单位。显示通常保留六位小数；计算使用 JavaScript 双精度数值，不先将输入截断至六位小数。

## 快速启动

建议使用 Node.js 24 与 pnpm。SDK 58 官方环境表列出的最低 Node.js 版本为 22.13.x，系统支持基线为 Android 7+ 和 iOS 16.4+；较旧的 iOS 设备不在本版本支持范围内。见 [Expo SDK 58 参考](https://docs.expo.dev/versions/v58.0.0/)。

在项目目录执行：

```powershell
pnpm install
pnpm start
```

在手机中安装与当前 SDK 兼容的 Expo Go，并通过开发服务器二维码打开项目。首次开发预览需要下载运行环境，且手机需访问开发服务器。若商店中的 Expo Go 尚不支持项目 SDK，可使用对应 SDK 的开发构建；见 [Expo 开发环境配置](https://docs.expo.dev/get-started/set-up-your-environment/)。

浏览器预览：

```powershell
pnpm web
```

如果 Windows PowerShell 无法解析 `pnpm`，可将上述命令中的 `pnpm` 替换为 `pnpm.cmd`。无需依赖全局 `npm` 命令。

开发预览与正式安装包不同：独立发布版将程序和算法打包进应用，核心计算不依赖开发服务器，可在飞行模式中使用。浏览器预览主要用于布局和流程检查，不替代原生设备测试，也没有配置可安装的离线 PWA。

## 数学模型

采用列向量约定：

```text
P2 ≈ R × P1 + t
D2 = R × D1 + t
```

R 是满足 `RᵀR = I`、`det(R) = +1` 的旋转矩阵，t 是平移向量。目标是最小化各对应参考点的平方距离之和，不允许缩放、镜像反射或形变。

原 Python 脚本使用 NumPy SVD 实现 Kabsch 算法；移动端使用 Horn 四元数形式及 Jacobi 对称矩阵特征分解，求解相同的最小二乘刚体配准问题。因此手机不需要捆绑 Python 或 NumPy。

界面输入三对参考点；核心 `computeRigidTransform` 支持三对或更多参考点。两个参考点集合都必须不共线。核心会拒绝重合、共线或接近共线的点集，以及非法数值和无法处理的数值范围。共面且不共线的参考点是有效的。

每个参考点残差为 `||R × Pi + t − Qi||`，RMS 为这些残差平方均值的平方根，最大误差为最大残差；三者与输入坐标单位一致。残差衡量这组参考点与刚体模型的吻合程度，不能解释为 D2 的置信区间或保证精度。参考点量测偏差、分布不良及目标点远离参考点，仍可能影响结果。

### 原脚本示例

| 点 | 初始坐标 | 变换后坐标 |
| --- | --- | --- |
| A | `(0, 0, 0)` | `(1, 2, 3)` |
| B | `(1, 0, 0)` | `(1, 3, 3)` |
| C | `(0, 1, 0)` | `(0, 2, 3)` |
| D | `(0.5, 0.5, 1)` | **`(0.5, 2.5, 4)`** |

对应 `R = [[0, −1, 0], [1, 0, 0], [0, 0, 1]]`，`t = [1, 2, 3]`，参考点残差在浮点误差范围内接近 0。

## 校验

```powershell
pnpm typecheck
pnpm test
python tests/compare_numpy.py
pnpm export
```

Python 对照测试需要 NumPy；如本机未安装，先执行 `python -m pip install numpy`。它直接调用保留的 `transfer.py`，与移动端 TypeScript 求解结果对比。

数值核心已通过 9 项单元测试，以及 130 组 Python NumPy 对照案例，涵盖不同数量参考点、测量噪声及反射输入，对 R、t、D2 和残差的最大绝对差为约 `1.020e-12`。可运行上述命令复现结果；其它检查的实际完成情况以本次交付说明或执行输出为准。

`pnpm export` 导出应用资源与各平台 JavaScript bundle，不产生 APK 或 IPA，也不代表完成了 Android/iOS 原生编译、安装或真机验收。

## 生成安装包

项目已包含 `eas.json`。首次构建前，确认 `app.json` 中的应用名称、Android 包名及 iOS Bundle Identifier 属于你的项目，再登录并关联自己的 Expo 项目：

```powershell
pnpm dlx eas-cli login
pnpm dlx eas-cli init
```

Android 内部测试 APK：

```powershell
pnpm dlx eas-cli build --platform android --profile preview
```

`preview` 配置生成 APK。用于应用商店的 Android 生产构建使用 `--profile production`，默认生成 AAB。详情见 [Expo 首次构建](https://docs.expo.dev/build/setup/)。

iOS 内部测试需要 Apple 开发者签名及已登记的测试设备：

```powershell
pnpm dlx eas-cli device:create
pnpm dlx eas-cli build --platform ios --profile preview
```

用于 TestFlight/App Store 的构建使用 `--profile production`。iOS 分发涉及 Apple Developer Program、证书与描述文件；详情见 [Apple 开发者账号和签名要求](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/)。

EAS 云构建可从 Windows 发起；若在本机编译 iOS，需在 macOS 上使用 Xcode。当前项目没有替用户创建云项目、上传源码、生成签名安装包或提交应用商店。这些步骤需要使用者的开发者账号与签名配置。构建前建议运行 `pnpm dlx expo-doctor`。

## 本地数据与隐私

输入草稿和计算记录保存在应用本地存储。应用没有业务后端、账号系统或自动上传坐标的功能；点击分享后，数据交由用户选择的系统分享目标处理。分享前可确认接收方。

本地记录不是加密保险箱；卸载应用、清除应用数据，或清除浏览器站点存储，可能删除记录。重要结果请自行保存导出的数据。

## 文件结构

```text
App.tsx                           移动端界面与计算流程
src/models.ts                     表单、单位与记录数据模型
src/core/rigidTransform.ts         离线刚体配准核心
src/components/CoordinatePreview.tsx  空间及平面预览
tests/rigidTransform.test.ts       数值核心单元测试
tests/compare_numpy.py             原 Python 脚本交叉验证
transfer.py                       用户提供的原始脚本
app.json / eas.json                应用与构建配置
docs/产品设计.md                   产品流程、架构与边界
```
