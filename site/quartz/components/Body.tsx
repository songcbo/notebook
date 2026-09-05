// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
// @ts-ignore
import diagramModalScript from "./scripts/diagram-modal.inline"
import clipboardStyle from "./styles/clipboard.scss"
import diagramModalStyle from "./styles/diagram-modal.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return <div id="quartz-body">{children}</div>
}

Body.afterDOMLoaded = [clipboardScript, diagramModalScript]
Body.css = [clipboardStyle, diagramModalStyle]

export default (() => Body) satisfies QuartzComponentConstructor
