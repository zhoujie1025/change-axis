import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, useWindowDimensions, Platform, KeyboardAvoidingView, Modal, Share, Keyboard } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import CoordinatePreview from './src/components/CoordinatePreview';
import Icon from './src/components/Icon';
import { solveTargetPoint } from './src/core/rigidTransform';
import { CoordinateText, EXAMPLE, InputData, SavedCalculation, Unit, emptyInput, formatNumber, isInputData, isSavedCalculation, isUnit, parseInput } from './src/models';

type Tab = 'work' | 'history' | 'guide';
type Result = ReturnType<typeof solveTargetPoint>;
const STORAGE_KEY = 'pointshift.workspace.v1';
const tabs: { key: Tab; label: string; icon: string }[] = [{ key: 'work', label: '坐标计算', icon: 'calc' }, { key: 'history', label: '计算记录', icon: 'history' }, { key: 'guide', label: '使用指南', icon: 'book' }];
const C = { green: '#196A55', dark: '#193D32', ink: '#233B33', muted: '#7A8983', border: '#E5EBE7', mint: '#EAF4EE', bg: '#F5F7F6' };
const evaluate = (input: InputData) => { const p = parseInput(input); return solveTargetPoint(p.source, p.destination, p.target); };

function Action({ label, icon, onPress, primary = false, small = false, disabled = false }: { label: string; icon?: string; onPress: () => void; primary?: boolean; small?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, primary && s.primary, small && s.smallAction, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
    {icon && <Icon name={icon} size={small ? 15 : 18} color={primary ? '#fff' : C.green} />}<Text style={[s.actionText, primary && { color: '#fff' }, small && { fontSize: 12 }]}>{label}</Text>
  </Pressable>;
}
function SectionTitle({ number, title, note }: { number: string; title: string; note?: string }) {
  return <View style={s.sectionTitle}><Text style={s.step}>{number}</Text><View style={{ flex: 1 }}><Text style={s.cardTitle}>{title}</Text>{note && <Text style={s.subtitle}>{note}</Text>}</View></View>;
}
function CoordinateRow({ label, value, onChange, target = false }: { label: string; value: CoordinateText; onChange: (axis: number, text: string) => void; target?: boolean }) {
  return <View style={s.coordinateRow}><View style={[s.pointBadge, target && { backgroundColor: '#FFF0DE' }]}><Text style={[s.pointLabel, target && { color: '#AA7033' }]}>{label}</Text></View>
    {value.map((text, axis) => <TextInput key={axis} accessibilityLabel={`${label} 的 ${'XYZ'[axis]} 坐标`} value={text} onChangeText={v => onChange(axis, v)} placeholder="0.000" placeholderTextColor="#B4BFB9" keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} autoCorrect={false} autoCapitalize="none" selectTextOnFocus maxLength={80} style={s.input} />)}
  </View>;
}
function AxisHeader() { return <View style={s.axisHeader}><Text style={{ width: 34 }} /><Text style={s.axisText}>X</Text><Text style={s.axisText}>Y</Text><Text style={s.axisText}>Z</Text></View>; }

export default function App() { return <SafeAreaProvider><Workspace /></SafeAreaProvider>; }
function Workspace() {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [tab, setTab] = useState<Tab>('work');
  const [input, setInput] = useState<InputData>(EXAMPLE);
  const [unit, setUnit] = useState<Unit>('mm');
  const [result, setResult] = useState<Result | null>(() => evaluate(EXAMPLE));
  const [history, setHistory] = useState<SavedCalculation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [precision, setPrecision] = useState(6);
  const [details, setDetails] = useState(false);
  const [example, setExample] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const columnsY = useRef(0);
  const resultY = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw || !alive) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') throw new Error('Invalid data');
      if (isInputData(data.input)) { setInput(data.input); setResult(null); setExample(false); }
      if (isUnit(data.unit)) setUnit(data.unit);
      if (Array.isArray(data.history)) setHistory(data.history.filter(isSavedCalculation).slice(0, 30));
    }).catch(() => { if (alive) setToast('无法读取本地记录，当前仍可离线计算。'); }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify({ input, unit, history });
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, payload)).catch(() => setToast('本地保存失败，请复制重要结果。'));
    }, 250);
    return () => clearTimeout(timer);
  }, [input, unit, history, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);

  function changePoint(group: 'source' | 'destination' | 'target', row: number, axis: number, value: string) {
    setInput(previous => {
      if (group === 'target') { const point: CoordinateText = [...previous.target]; point[axis] = value; return { ...previous, target: point }; }
      const points = previous[group].map(point => [...point] as CoordinateText); points[row][axis] = value; return { ...previous, [group]: points };
    });
    setResult(null); setError(''); setExample(false);
  }
  function calculate() {
    Keyboard.dismiss();
    try {
      const next = evaluate(input);
      setResult(next); setError(''); setExample(false);
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), input, unit };
      setHistory(previous => [entry, ...previous].slice(0, 30));
      if (!desktop) setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, resultY.current - 12), animated: true }), 100);
    } catch (e) { setResult(null); setError(e instanceof Error ? e.message : '计算失败，请检查输入。'); }
  }
  function loadExample() { setInput(EXAMPLE); setResult(evaluate(EXAMPLE)); setError(''); setExample(true); setToast('已载入原 Python 脚本的示例。'); }
  function loadHistory(entry: SavedCalculation) {
    try { const next = evaluate(entry.input); setInput(entry.input); setUnit(entry.unit); setResult(next); setError(''); setExample(false); setTab('work'); scroll.current?.scrollTo({ y: 0, animated: true }); setToast('已恢复这次计算，可以继续编辑。'); }
    catch { setToast('该记录的数据无效，无法恢复。'); }
  }
  const report = () => JSON.stringify({ app: 'PointShift', version: 1, unit, input: parseInput(input), targetPoint: result?.targetPoint, rotation: result?.rotation, translation: result?.translation, rmsError: result?.rmsError, maxError: result?.maxError, residuals: result?.residuals }, null, 2);
  async function copyResult() {
    if (!result) return;
    try { await Clipboard.setStringAsync(`D2 (${unit})\nX: ${result.targetPoint[0]}\nY: ${result.targetPoint[1]}\nZ: ${result.targetPoint[2]}\nRMS: ${result.rmsError}`); setToast('已复制完整精度的 D₂ 坐标和 RMS 误差。'); } catch { setToast('复制失败，请检查剪贴板权限。'); }
  }
  async function shareResult() {
    if (!result) return;
    try {
      if (Platform.OS === 'web') { await Clipboard.setStringAsync(report()); setToast('已复制 JSON 报告，可粘贴到文件中保存。'); }
      else await Share.share({ message: report(), title: '点移 · 坐标变换报告' });
    } catch { setToast('分享失败，可以使用复制坐标保存结果。'); }
  }
  let preview: ReturnType<typeof parseInput> | null = null;
  try { preview = parseInput(input); } catch { /* Incomplete drafts render an empty preview. */ }
  const nav = (mobile = false) => <View style={mobile ? s.bottomTabs : s.tabs}>{tabs.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} accessibilityLabel={item.label} onPress={() => { setTab(item.key); scroll.current?.scrollTo({ y: 0 }); }} style={[mobile ? s.bottomTab : s.tab, tab === item.key && (mobile ? {} : s.tabActive)]}><Icon name={item.icon} color={tab === item.key ? C.green : C.muted} size={mobile ? 21 : 17} /><Text style={[mobile ? s.bottomTabLabel : s.tabLabel, tab === item.key && { color: C.green, fontWeight: '700' }]}>{item.label}</Text></Pressable>)}</View>;

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><StatusBar style="dark" />
    <View style={s.header}><View style={[s.headerInner, !desktop && { paddingHorizontal: 20 }]}>
      <View style={s.brand}><View style={s.logo}><Icon name="target" size={25} color="#fff" /></View><View><Text style={s.brandName}>点移 <Text style={s.brandEnglish}>PointShift</Text></Text><Text style={s.brandTag}>三维坐标 · 刚体变换</Text></View></View>
      {desktop && nav()}<View style={s.offline}><View style={s.onlineDot} /><Text style={s.offlineText}>离线可用</Text></View>
    </View></View>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={[s.scrollContent, !desktop && { padding: 18, paddingBottom: 28 }]} keyboardShouldPersistTaps="handled">
        <View style={s.page}>
          <View style={[s.hero, !desktop && { marginBottom: 23, marginTop: 7 }]}><View><Text style={s.eyebrow}>{tab === 'work' ? 'COORDINATE WORKSPACE' : tab === 'history' ? 'LOCAL HISTORY' : 'QUICK GUIDE'}</Text><Text style={[s.heroTitle, !desktop && { fontSize: 29 }]}>{tab === 'work' ? '三点定位，一步求解。' : tab === 'history' ? '每一次计算，都有迹可循。' : '从已知坐标，到新的位置。'}</Text><Text style={s.heroDescription}>{tab === 'work' ? '输入参考点变换前后的坐标，计算目标点的新位置。' : tab === 'history' ? '最近 30 次计算保存在本机，点击记录即可恢复。' : '三个对应参考点，确定同一刚体在空间中的旋转与平移。'}</Text></View>{desktop && <View style={s.heroMark}><Icon name="shield" size={18} color={C.green} /><Text style={s.heroMarkText}>本机计算 · 隐私安心</Text></View>}</View>

          {tab === 'work' && <View onLayout={event => { columnsY.current = event.nativeEvent.layout.y; }} style={[s.columns, !desktop && { flexDirection: 'column' }]}>
            <View style={s.leftColumn}>
              <View style={s.card}><View style={s.cardTop}><SectionTitle number="01" title="参考点坐标" note="同名点一一对应，至少三个不共线的点" /><View style={s.inline}><Action small label="示例" icon="reset" onPress={loadExample} /><Action small label="清空" onPress={() => setConfirmClear(true)} /></View></View>
                <View style={s.unitBar}><View style={s.inline}><Icon name="info" size={14} /><Text style={s.mutedSmall}>所有坐标使用同一单位</Text></View><View style={s.unitToggle}>{(['mm', 'cm', 'm'] as Unit[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`单位 ${value}`} accessibilityState={{ selected: unit === value }} style={[s.unitOption, unit === value && s.unitSelected]} onPress={() => setUnit(value)}><Text style={[s.unitLabel, unit === value && { color: C.green, fontWeight: '700' }]}>{value}</Text></Pressable>)}</View></View>
                <View style={s.pointGroup}><View style={s.groupHeading}><View style={[s.groupDot, { backgroundColor: '#7B95A8' }]} /><Text style={s.groupTitle}>初始状态</Text><Text style={s.groupCaption}>变换前 · P₁</Text></View><AxisHeader />{input.source.map((point, index) => <CoordinateRow key={index} label={`${'ABC'[index]}₁`} value={point} onChange={(axis, text) => changePoint('source', index, axis, text)} />)}</View>
                <View style={s.flowDivider}><View style={s.rule} /><View style={s.flowTag}><Icon name="arrow" size={13} color={C.green} /><Text style={s.flowText}>旋转 + 平移</Text></View><View style={s.rule} /></View>
                <View style={s.pointGroup}><View style={s.groupHeading}><View style={[s.groupDot, { backgroundColor: C.green }]} /><Text style={s.groupTitle}>目标状态</Text><Text style={s.groupCaption}>变换后 · P₂</Text></View><AxisHeader />{input.destination.map((point, index) => <CoordinateRow key={index} label={`${'ABC'[index]}₂`} value={point} onChange={(axis, text) => changePoint('destination', index, axis, text)} />)}</View>
              </View>
              <View style={s.card}><SectionTitle number="02" title="待求目标点" note="输入 D 点的初始坐标，求变换后的 D₂" /><AxisHeader /><CoordinateRow label="D₁" value={input.target} target onChange={(axis, text) => changePoint('target', 0, axis, text)} /><View style={s.targetNote}><Icon name="info" size={14} /><Text style={s.noteText}>D 点与 A、B、C 保持相对位置不变。</Text></View>
                {error !== '' && <View accessibilityRole="alert" style={s.errorBox}><Icon name="info" color="#AC4A37" size={18} /><Text style={s.errorText}>{error}</Text></View>}
                <Action label={ready ? '计算目标坐标' : '正在读取本地数据…'} icon="arrow" primary onPress={calculate} disabled={!ready} /><Text style={s.calculationFootnote}>双精度计算 · 结果自动保存至本机</Text>
              </View>
            </View>

            <View style={s.rightColumn} onLayout={event => { resultY.current = event.nativeEvent.layout.y + columnsY.current; }}>
              <View style={s.resultCard}><View style={s.resultHeader}><View style={s.inline}><View style={s.darkStep}><Text style={s.darkStepText}>03</Text></View><Text style={s.resultTitle}>变换结果</Text></View><Text style={s.resultBadge}>{result ? (example ? '示例结果' : '已完成') : '待计算'}</Text></View><View style={s.resultSubline}><Text style={s.resultSubtitle}>目标点 D₂</Text><Text style={s.resultUnit}>单位 / {unit}</Text></View>
                <View style={s.resultCoordinates}>{['X', 'Y', 'Z'].map((axis, i) => <View key={axis} style={s.resultCoordinate}><Text style={s.resultAxis}>{axis}</Text><Text selectable adjustsFontSizeToFit numberOfLines={1} style={s.resultValue}>{result ? formatNumber(result.targetPoint[i], precision) : '—'}</Text></View>)}</View>
                <View style={s.resultFooter}><Icon name={result ? 'check' : 'info'} size={15} color="#B3D7C7" /><Text style={s.resultFooterText}>{result ? '已根据参考点完成最优刚体拟合' : '填写坐标后，点击“计算目标坐标”'}</Text></View>
              </View>
              <View style={s.card}><View style={s.cardTop}><Text style={s.cardTitle}>空间预览</Text><Text style={s.tinyTag}>示意 · 自动缩放</Text></View><CoordinatePreview source={preview?.source || []} destination={preview?.destination || []} target={preview?.target || [NaN, NaN, NaN]} transformed={result?.targetPoint || null} /></View>
              <View style={s.card}><View style={s.cardTop}><View style={s.inline}><Icon name="target" size={17} color={C.green} /><Text style={s.cardTitle}>拟合检验</Text></View><Text style={s.mutedSmall}>单位：{unit}</Text></View><View style={s.metrics}><View style={s.metric}><Text style={s.metricLabel}>RMS 均方根误差</Text><Text selectable style={s.metricValue}>{result ? result.rmsError.toExponential(2) : '—'}</Text></View><View style={[s.metric, s.metricDivider]}><Text style={s.metricLabel}>最大点位误差</Text><Text selectable style={s.metricValue}>{result ? result.maxError.toExponential(2) : '—'}</Text></View></View><Text style={s.noteText}>误差越小，参考点越符合刚体关系。测量噪声或形变可能导致残差。</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={details ? '收起变换详情' : '查看变换详情'} accessibilityState={{ expanded: details }} style={s.detailsToggle} onPress={() => setDetails(v => !v)}><Text style={s.detailsLabel}>{details ? '收起变换详情' : '查看旋转矩阵与平移向量'}</Text><View style={{ transform: [{ rotate: details ? '90deg' : '0deg' }] }}><Icon name="chevron" size={15} color={C.green} /></View></Pressable>
                {details && <View style={s.details}>{result ? <><Text style={s.detailHeading}>旋转矩阵 R</Text>{result.rotation.map((row, i) => <Text key={i} selectable style={s.matrixRow}>{row.map(n => formatNumber(n, precision)).join('    ')}</Text>)}<Text style={s.detailHeading}>平移向量 t</Text><Text selectable style={s.matrixRow}>{result.translation.map(n => formatNumber(n, precision)).join('    ')}</Text><Text style={s.detailHeading}>参考点残差</Text>{result.residuals.map((value, i) => <Text key={i} style={s.residualRow}>{'ABC'[i]}　{value.toExponential(4)} {unit}</Text>)}<Text style={s.formula}>P₂ = R × P₁ + t</Text></> : <Text style={s.noteText}>完成计算后可查看 R、t 和逐点残差。</Text>}</View>}
                <View style={s.precisionRow}><Text style={s.mutedSmall}>显示小数位</Text><View style={s.unitToggle}>{[3, 6, 9].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`显示 ${n} 位小数`} onPress={() => setPrecision(n)} style={[s.unitOption, precision === n && s.unitSelected]}><Text style={[s.unitLabel, precision === n && { color: C.green }]}>{n}</Text></Pressable>)}</View></View><View style={s.resultActions}><View style={{ flex: 1 }}><Action label="复制坐标" icon="copy" disabled={!result} onPress={copyResult} /></View><View style={{ flex: 1 }}><Action label={Platform.OS === 'web' ? '复制报告' : '分享报告'} icon="share" disabled={!result} onPress={shareResult} /></View></View>
              </View>
            </View>
          </View>}

          {tab === 'history' && <View style={s.historyContainer}>{history.length === 0 ? <View style={s.emptyCard}><View style={s.emptyIcon}><Icon name="history" color={C.green} size={32} /></View><Text style={s.emptyTitle}>还没有计算记录</Text><Text style={s.emptyDescription}>完成一次坐标计算后，输入和结果会保存在这里。</Text><Action label="开始第一次计算" icon="arrow" primary onPress={() => setTab('work')} /></View> : history.map((entry, i) => <View key={entry.id} style={s.historyCard}><Pressable accessibilityRole="button" accessibilityLabel={`恢复计算 ${new Date(entry.createdAt).toLocaleString('zh-CN')}`} style={s.historyItem} onPress={() => loadHistory(entry)}><View style={s.historyIndex}><Text style={s.historyIndexText}>{String(history.length - i).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={s.historyTitle}>三点刚体变换 <Text style={s.historyUnit}>/ {entry.unit}</Text></Text><Text style={s.historyDate}>{new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}</Text><Text style={s.historyCoordinate} numberOfLines={1}>D₁　{entry.input.target.join(' , ')}</Text></View><Icon name="chevron" size={18} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`删除第 ${history.length - i} 条记录`} style={s.deleteButton} onPress={() => { setHistory(previous => previous.filter(x => x.id !== entry.id)); setToast('已删除该条计算记录。'); }}><Icon name="trash" size={17} /></Pressable></View>)}</View>}

          {tab === 'guide' && <View style={s.guideContainer}>
            {[['01', '选取三个参考点', '在同一刚体上选择 A、B、C 三个不共线的点。依次输入它们变换前后的 X、Y、Z 坐标，确保同名点准确对应。'], ['02', '输入目标点并计算', '输入与参考点属于同一刚体的 D₁ 坐标。点击计算，即可得到变换后的 D₂，以及旋转矩阵 R、平移向量 t。'], ['03', '检查残差，再使用结果', 'RMS 是三个参考点拟合残差的均方根；最大误差是最差参考点的残差。结合测量精度判断是否可用，残差不是目标点的置信区间。']].map(([number, title, description]) => <View style={s.guideCard} key={number}><SectionTitle number={number} title={title} /><Text style={s.guideText}>{description}</Text></View>)}
            <View style={s.guideCard}><Text style={s.cardTitle}>计算约定</Text><Text style={s.guideText}>• 使用右手坐标系，仅估计旋转和平移，不包含缩放或镜像。{'\n\n'}• 所有输入必须使用相同单位；切换 mm / cm / m 只修改标签，不会换算数值。{'\n\n'}• 输入支持负数、小数和科学计数法。接近共线的点会被拒绝，请选取分布更开的参考点。{'\n\n'}• 显示位数只影响界面，计算、复制和报告保留完整数值精度。</Text><View style={s.guideFormula}><Text style={s.guideFormulaText}>D₂ = R × D₁ + t</Text><Text style={s.mutedSmall}>刚体变换 / Rigid Transformation</Text></View></View>
            <View style={s.guideCard}><View style={s.inline}><Icon name="shield" color={C.green} /><Text style={s.cardTitle}>离线运算，本机保存</Text></View><Text style={s.guideText}>计算过程无需网络，不会上传坐标。草稿和最近 30 条记录只保存在当前设备。卸载应用、清除应用数据或浏览器存储会删除记录，请及时复制或分享重要结果。正式安装包可离线启动；开发预览首次加载需要连接开发电脑。</Text></View>
          </View>}

          <View style={s.footer}><View style={s.inline}><Icon name="shield" size={13} /><Text style={s.footerText}>数据留在本机，计算无需网络</Text></View><Text style={s.footerText}>PointShift  /  v1.0</Text></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {!desktop && nav(true)}
    {!!toast && <View pointerEvents="none" style={[s.toast, !desktop && { bottom: 85 }]}><Icon name="info" color="#D5E8DE" size={17} /><Text accessibilityLiveRegion="polite" style={s.toastText}>{toast}</Text></View>}
    <Modal visible={confirmClear} transparent animationType="fade" onRequestClose={() => setConfirmClear(false)}><View style={s.modalOverlay}><View style={s.modalCard}><Text style={s.emptyTitle}>清空当前坐标？</Text><Text style={s.emptyDescription}>将清空全部输入和当前结果，已有计算记录仍会保留。</Text><View style={s.resultActions}><View style={{ flex: 1 }}><Action label="取消" onPress={() => setConfirmClear(false)} /></View><View style={{ flex: 1 }}><Action label="确认清空" primary onPress={() => { setInput(emptyInput()); setResult(null); setError(''); setExample(false); setConfirmClear(false); }} /></View></View></View></View></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, header: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.border }, headerInner: { width: '100%', maxWidth: 1240, alignSelf: 'center', minHeight: 84, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 }, logo: { width: 42, height: 42, backgroundColor: C.green, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, brandName: { fontSize: 20, color: C.dark, fontWeight: '800', letterSpacing: 0.3 }, brandEnglish: { fontSize: 16, fontWeight: '600' }, brandTag: { fontSize: 10, color: C.muted, marginTop: 3, letterSpacing: 1.4 },
  tabs: { flexDirection: 'row', gap: 6 }, tab: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }, tabActive: { backgroundColor: C.mint }, tabLabel: { color: C.muted, fontSize: 13 }, offline: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }, onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4B9374' }, offlineText: { fontSize: 11, color: C.green },
  scrollContent: { padding: 36, paddingTop: 37 }, page: { width: '100%', maxWidth: 1168, alignSelf: 'center' }, hero: { marginBottom: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 18 }, eyebrow: { fontSize: 10, letterSpacing: 2.5, color: '#779083', fontWeight: '700', marginBottom: 11 }, heroTitle: { fontSize: 34, lineHeight: 47, fontWeight: '700', color: C.dark, letterSpacing: -0.8 }, heroDescription: { marginTop: 9, fontSize: 13, lineHeight: 22, color: '#7C8B84' }, heroMark: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 }, heroMarkText: { fontSize: 12, color: C.green },
  columns: { flexDirection: 'row', gap: 24, alignItems: 'stretch' }, leftColumn: { flex: 1.12, gap: 20, minWidth: 0 }, rightColumn: { flex: 1, gap: 20, minWidth: 0 }, card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 22 }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 18 }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 }, step: { fontSize: 11, fontWeight: '700', color: C.green, backgroundColor: C.mint, width: 30, height: 30, textAlign: 'center', lineHeight: 30, borderRadius: 9, overflow: 'hidden' }, cardTitle: { color: C.ink, fontSize: 15, fontWeight: '700' }, subtitle: { color: C.muted, fontSize: 10, marginTop: 5, lineHeight: 16 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  action: { minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#fff' }, primary: { backgroundColor: C.green, borderColor: C.green, minHeight: 49 }, actionText: { color: C.green, fontSize: 13, fontWeight: '600' }, smallAction: { minHeight: 32, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7 },
  unitBar: { paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderColor: '#F0F3F1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, mutedSmall: { fontSize: 10, color: C.muted }, unitToggle: { flexDirection: 'row', backgroundColor: '#F3F5F4', padding: 3, borderRadius: 7 }, unitOption: { minWidth: 32, minHeight: 28, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 5 }, unitSelected: { backgroundColor: '#fff' }, unitLabel: { fontSize: 10, color: C.muted }, pointGroup: {}, groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }, groupDot: { width: 7, height: 7, borderRadius: 3.5 }, groupTitle: { fontSize: 12, fontWeight: '700', color: C.ink }, groupCaption: { marginLeft: 'auto', fontSize: 10, color: '#9AA59F' }, axisHeader: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 7 }, axisText: { flex: 1, textAlign: 'center', color: '#95A39B', fontSize: 10, fontWeight: '600' }, coordinateRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 9 }, pointBadge: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F0F4F2', alignItems: 'center', justifyContent: 'center' }, pointLabel: { color: '#61796D', fontWeight: '600', fontSize: 12 }, input: { flex: 1, minWidth: 0, backgroundColor: '#F9FBFA', height: 40, borderWidth: 1, borderColor: '#E7EDE9', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: C.ink, textAlign: 'center', fontVariant: ['tabular-nums'] }, flowDivider: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 14 }, rule: { height: 1, backgroundColor: '#EDF1EE', flex: 1 }, flowTag: { flexDirection: 'row', alignItems: 'center', gap: 5 }, flowText: { fontSize: 10, color: '#93A399' }, targetNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 20 }, noteText: { color: C.muted, fontSize: 10, lineHeight: 18, flexShrink: 1 }, calculationFootnote: { textAlign: 'center', fontSize: 10, color: '#99A69F', marginTop: 12 }, errorBox: { backgroundColor: '#FFF1EC', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 }, errorText: { flex: 1, fontSize: 12, lineHeight: 20, color: '#AC4A37' },
  resultCard: { backgroundColor: C.dark, borderRadius: 17, padding: 24 }, resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 }, darkStep: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#315448', alignItems: 'center', justifyContent: 'center' }, darkStepText: { color: '#B9D6C6', fontSize: 11 }, resultTitle: { color: '#F3F9F5', fontSize: 15, fontWeight: '600' }, resultBadge: { color: '#C1DDCC', backgroundColor: '#315548', fontSize: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, overflow: 'hidden' }, resultSubline: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, resultSubtitle: { color: '#B5CCBF', fontSize: 11 }, resultUnit: { color: '#8CAC9B', fontSize: 10 }, resultCoordinates: { flexDirection: 'row', gap: 10 }, resultCoordinate: { flex: 1, backgroundColor: '#25483B', borderWidth: 1, borderColor: '#365548', borderRadius: 10, paddingHorizontal: 10, paddingTop: 11, paddingBottom: 14, minWidth: 0 }, resultAxis: { fontSize: 10, color: '#96BAA5', marginBottom: 8 }, resultValue: { color: '#F3F8F5', fontSize: 22, fontWeight: '500', fontVariant: ['tabular-nums'] }, resultFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 }, resultFooterText: { fontSize: 10, color: '#ACCABA' }, tinyTag: { fontSize: 9, color: '#8F9E96', backgroundColor: '#F5F7F5', padding: 5, borderRadius: 5 }, metrics: { flexDirection: 'row', marginTop: 3, marginBottom: 16 }, metric: { flex: 1 }, metricDivider: { borderLeftWidth: 1, borderColor: C.border, paddingLeft: 22 }, metricLabel: { fontSize: 10, color: C.muted, marginBottom: 10 }, metricValue: { color: C.dark, fontSize: 22, fontWeight: '500', fontVariant: ['tabular-nums'] }, detailsToggle: { paddingTop: 16, paddingBottom: 10, marginTop: 14, borderTopWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailsLabel: { fontSize: 11, color: C.green }, details: { backgroundColor: '#F6F9F7', padding: 12, borderRadius: 8, marginTop: 7 }, detailHeading: { fontSize: 11, fontWeight: '700', color: C.ink, marginBottom: 8, marginTop: 9 }, matrixRow: { fontSize: 10, color: '#5E7568', lineHeight: 22, fontVariant: ['tabular-nums'], flexWrap: 'wrap' }, residualRow: { fontSize: 11, color: C.muted, lineHeight: 23 }, formula: { fontSize: 12, color: C.green, textAlign: 'center', marginTop: 14, marginBottom: 6 }, precisionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }, resultActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 28 }, footerText: { fontSize: 9, color: '#98A59E' }, bottomTabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.border, minHeight: 66, paddingTop: 10, paddingBottom: 8 }, bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 }, bottomTabLabel: { color: C.muted, fontSize: 10 },
  historyContainer: { gap: 12, minHeight: 460 }, emptyCard: { alignItems: 'center', backgroundColor: '#fff', padding: 38, paddingVertical: 65, borderRadius: 17, borderWidth: 1, borderColor: C.border }, emptyIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.mint, justifyContent: 'center', alignItems: 'center', marginBottom: 22 }, emptyTitle: { fontSize: 19, fontWeight: '700', color: C.ink, marginBottom: 12 }, emptyDescription: { fontSize: 12, color: C.muted, lineHeight: 21, marginBottom: 24 }, historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 13 }, historyItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 15, padding: 19 }, historyIndex: { backgroundColor: C.mint, borderRadius: 9, padding: 10 }, historyIndexText: { fontSize: 12, color: C.green }, historyTitle: { fontSize: 14, fontWeight: '600', color: C.ink }, historyUnit: { fontSize: 10, color: C.muted }, historyDate: { fontSize: 10, color: C.muted, marginTop: 6 }, historyCoordinate: { color: '#758A7E', fontSize: 11, marginTop: 10 }, deleteButton: { padding: 14, marginRight: 5 }, guideContainer: { maxWidth: 780, width: '100%', alignSelf: 'center', gap: 16 }, guideCard: { padding: 24, backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: C.border }, guideText: { fontSize: 13, lineHeight: 25, color: '#6F8176', marginTop: 16 }, guideFormula: { padding: 26, backgroundColor: C.mint, borderRadius: 10, alignItems: 'center', gap: 12, marginTop: 22 }, guideFormulaText: { fontSize: 24, color: C.green, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#244A3C', borderRadius: 11, paddingVertical: 14, paddingHorizontal: 18, maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 9, elevation: 8, boxShadow: '0px 4px 20px rgba(20, 50, 35, 0.15)' }, toastText: { color: '#EDF7F0', fontSize: 12, lineHeight: 20, flexShrink: 1 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 40, 30, 0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 26, width: '100%', maxWidth: 410 },
});
