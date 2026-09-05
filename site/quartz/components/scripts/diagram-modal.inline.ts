let diagramDialog: HTMLDialogElement | null = null
let diagramFrame: HTMLIFrameElement | null = null
let diagramTitle: HTMLElement | null = null

function isHtmlDiagram(link: HTMLAnchorElement) {
  try {
    const pathname = new URL(link.href).pathname
    return pathname.includes("/diagrams/") && pathname.endsWith(".html")
  } catch {
    return false
  }
}

function getDiagramDialog() {
  if (!diagramDialog) {
    const dialog = (diagramDialog = document.createElement("dialog"))
    dialog.className = "diagram-modal"
    dialog.setAttribute("aria-labelledby", "diagram-modal-title")
    dialog.innerHTML = `
      <div class="diagram-modal__bar">
        <h2 id="diagram-modal-title"></h2>
        <button class="diagram-modal__close" type="button" aria-label="关闭交互图">×</button>
      </div>
      <iframe class="diagram-modal__frame" title="HTML 交互图"></iframe>
    `

    diagramFrame = dialog.querySelector(".diagram-modal__frame")
    diagramTitle = dialog.querySelector("#diagram-modal-title")

    dialog.querySelector(".diagram-modal__close")?.addEventListener("click", () => {
      dialog.close()
    })
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close()
    })
    dialog.addEventListener("close", () => {
      if (diagramFrame) diagramFrame.src = "about:blank"
    })
  }

  if (!document.body.contains(diagramDialog)) document.body.append(diagramDialog)
  return diagramDialog
}

function openDiagram(link: HTMLAnchorElement) {
  const dialog = getDiagramDialog()
  if (!diagramFrame || !diagramTitle) return

  diagramTitle.textContent = link.textContent?.trim() || "HTML 交互图"
  diagramFrame.src = link.href
  diagramFrame.title = diagramTitle.textContent
  dialog.showModal()
}

document.addEventListener("nav", () => {
  const links = [...document.querySelectorAll("a.internal")] as HTMLAnchorElement[]
  for (const link of links) {
    if (!isHtmlDiagram(link)) continue

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      openDiagram(link)
    }

    link.addEventListener("click", onClick)
    window.addCleanup(() => link.removeEventListener("click", onClick))
  }
})

document.addEventListener("prenav", () => {
  if (diagramDialog?.open) diagramDialog.close()
})
