# Protocols and Contracts

## API Contracts

- `useTextMeasurer(): TextMeasurer`，或 `useServices().measureText(options)`。
- `TextMeasurer = (options: MeasureTextOptions) => Promise<TextSize>`。
- 参数：text；style.fontSize/fontWeight/fontStyle/lineHeight；maxWidth；maxHeight；numberOfLines；ellipsizeMode。
- 默认：fontSize=16、maxWidth=100000、maxHeight不限、numberOfLines=0、normal/normal/tail。
- 返回 `{width,height}`，布局单位，只包含内容。maxHeight 仅裁剪高度。
- 空文本、零宽度、零高度返回 0×0，无宿主请求。
- 参数错误 INVALID_TEXT_MEASUREMENT；render 内 SERVICE_DURING_RENDER；卸载/销毁 SURFACE_DISPOSED；renderer reset 沿用 RENDERER_RESET。

## Compatibility Notes

- 沿用现有 MeasureRequest/MeasureResult，独立 requestId+nodeId 关联。
- TextSize 是内容尺寸；实际节点最终 frame 使用 onLayout/ref.measure。
- 首版只支持 Text 的已有排版属性。
