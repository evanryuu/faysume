import { Button } from './ui/button'
import { NativeSelect, NativeSelectOption } from './ui/native-select'
import { accentColors, readableAccent, resolveAppearance } from '../appearance'
import type { ResumeAppearance } from '../types'

export default function AppearancePanel({
  value,
  onChange,
  onReset,
}: {
  value?: ResumeAppearance
  onChange: (patch: Partial<ResumeAppearance>) => void
  onReset: () => void
}) {
  const appearance = resolveAppearance(value)
  return (
    <section className="appearance-panel" id="resume-appearance" aria-label="简历外观">
      <div className="appearance-heading">
        <div>
          <h2>简历外观</h2>
          <p>仅应用于这份简历，自动保存并用于 PDF。</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          恢复默认外观
        </Button>
      </div>
      <fieldset className="appearance-colors">
        <legend>主题色</legend>
        <div className="appearance-swatches">
          {accentColors.map((color) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              key={color.value}
              aria-pressed={appearance.accentColor.toLowerCase() === color.value}
              onClick={() => onChange({ accentColor: color.value })}
            >
              <span className="appearance-swatch" style={{ background: color.value }} aria-hidden="true" />
              {color.name}
              {appearance.accentColor.toLowerCase() === color.value && <span aria-hidden="true">✓</span>}
            </Button>
          ))}
          <label className="appearance-custom-color">
            <input
              type="color"
              aria-label="自定义主题色"
              value={appearance.accentColor}
              onChange={(event) => onChange({ accentColor: event.currentTarget.value })}
            />
            自定义
          </label>
        </div>
        <p className="appearance-note">
          正文保持深灰色。
          {readableAccent(appearance.accentColor) !== appearance.accentColor
            ? '当前颜色较浅，标题已自动加深以保证清晰。'
            : '主题色用于标题和装饰。'}
        </p>
      </fieldset>
      <div className="appearance-fields">
        <label>
          字体
          <NativeSelect
            value={appearance.fontFamily}
            onChange={(event) =>
              onChange({ fontFamily: event.currentTarget.value as ResumeAppearance['fontFamily'] })
            }
          >
            <NativeSelectOption value="sans">简洁黑体</NativeSelectOption>
            <NativeSelectOption value="serif">经典宋体</NativeSelectOption>
            <NativeSelectOption value="mono">等宽字体</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>
          正文字号
          <NativeSelect
            value={appearance.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.currentTarget.value) })}
          >
            {[9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13].map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size} pt
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label>
          行距
          <NativeSelect
            value={appearance.lineHeight}
            onChange={(event) => onChange({ lineHeight: Number(event.currentTarget.value) })}
          >
            {[1.3, 1.5, 1.65, 1.8, 1.9].map((height) => (
              <NativeSelectOption key={height} value={height}>
                {height} 倍
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label>
          段落间距
          <NativeSelect
            value={appearance.spacing}
            onChange={(event) =>
              onChange({ spacing: event.currentTarget.value as ResumeAppearance['spacing'] })
            }
          >
            <NativeSelectOption value="compact">紧凑</NativeSelectOption>
            <NativeSelectOption value="standard">适中</NativeSelectOption>
            <NativeSelectOption value="relaxed">宽松</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>
          页边距
          <NativeSelect
            value={appearance.margin}
            onChange={(event) => onChange({ margin: Number(event.currentTarget.value) })}
          >
            {[10, 14, 18, 22, 24].map((margin) => (
              <NativeSelectOption key={margin} value={margin}>
                {margin} mm
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <p className="appearance-note">字体使用本机可用字体；另一台设备上的字形可能不同。</p>
    </section>
  )
}
