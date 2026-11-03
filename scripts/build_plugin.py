"""Rebuild main.js from the MIT-licensed upstream 3.2.4 fixture."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]

def replace_once(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError("Unexpected upstream source at patch point: " + before)
    return source.replace(before, after, 1)

def main():
    original = (ROOT / "tests/fixtures/manual-sorting-3.2.4.js").read_bytes()
    if hashlib.sha256(original).hexdigest() != "f7022c4bb0e144c60af283c71451375358b92ed4a81772f9de16b37eeb352158":
        raise RuntimeError("Unexpected upstream fixture")
    source = original.decode("utf-8")
    source = replace_once(
        source,
        "explorerEl;dragStartHandler=null;",
        "explorerEl;dropHandler=null;dragStartHandler=null;",
    )
    # Only an internal desktop drag installs this capture handler. It claims
    # drops within this explorer before Obsidian's bubbling folder handler.
    source = replace_once(
        source,
        "let s=this.explorerEl.getBoundingClientRect(),c=!1;",
        """let s=this.explorerEl.getBoundingClientRect(),c=!1;
let manualDropAccepted=e.Platform.isMobile;
if(!e.Platform.isMobile){
    if(this.dropHandler)this.explorerEl.removeEventListener("drop",this.dropHandler,true);
    this.dropHandler=event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelAnimationFrame(this.rafId);
        c=event.clientX<s.left||event.clientX>s.right||event.clientY<s.top||event.clientY>s.bottom;
        if(c)return;
        this.collapseDraggedFolder(i);
        ({futureSibling:t,dropPosition:n}=this.findDropTarget(event.clientY));
        manualDropAccepted=!!t;
        if(event.dataTransfer)event.dataTransfer.dropEffect="move";
    };
    this.explorerEl.addEventListener("drop",this.dropHandler,true);
}
""",
    )
    source = replace_once(
        source,
        "delete this.explorerEl.dataset.dragActive,c)return;",
        """delete this.explorerEl.dataset.dragActive,
this.dropHandler&&(this.explorerEl.removeEventListener("drop",this.dropHandler,true),this.dropHandler=null),
c||!manualDropAccepted)return;""",
    )
    source = replace_once(
        source,
        "disable(){this.dragStartHandler&&",
        """disable(){
if(this.dropHandler){this.explorerEl.removeEventListener("drop",this.dropHandler,true);this.dropHandler=null;}
this.dragStartHandler&&""",
    )
    source = replace_once(
        source,
        "this.plugin.app.fileManager.renameFile(a,c),this.plugin.orderManager.move(o,c,n,r)",
        "o!==c&&this.plugin.app.fileManager.renameFile(a,c),this.plugin.orderManager.move(o,c,n,r)",
    )
    source = "// Local fix: claim explorer drops; skip same-path renames; ignore cancelled desktop drags.\n" + source
    code = source
    code = replace_once(code, "let e=await this.loadData()||{},t;", """let e=await this.loadData(),t;
if(e==null){
    const legacyPath=this.app.vault.configDir+"/plugins/manual-sorting/data.json";
    try{
        if(await this.app.vault.adapter.exists(legacyPath)){
            const legacy=JSON.parse(await this.app.vault.adapter.read(legacyPath));
            if(legacy&&typeof legacy==="object"&&!Array.isArray(legacy)&&legacy.customOrder&&typeof legacy.customOrder==="object"){
                e=legacy;
                await this.saveData(legacy);
                console.info("Manual Sorting Fixed: imported settings from Manual Sorting.");
            }
        }
    }catch(error){
        console.warn("Manual Sorting Fixed: could not import legacy settings; original data was preserved.",error);
    }
}
e=e||{};
""")
    # Register event references with Obsidian so disable/reload cleans them up.
    code = replace_once(code, "registerVaultHandlers(){this.app.vault.on(",
                        "registerVaultHandlers(){this.registerEvent(this.app.vault.on(")
    code = replace_once(code, "}),this.app.vault.on(`create`,", "})),this.registerEvent(this.app.vault.on(`create`,")
    code = replace_once(code, "}),this.app.vault.on(`delete`,", "})),this.registerEvent(this.app.vault.on(`delete`,")
    code = replace_once(code, "this.orderManager.remove(e.path)})}async loadSettings()", "this.orderManager.remove(e.path)}))}async loadSettings()")
    # Visible identity is distinct from the upstream plugin.
    code = replace_once(code, "this.setTitle(`Manual Sorting`)", "this.setTitle(`Manual Sorting Fixed`)")
    code = "// Manual Sorting Fixed 1.0.0 — unofficial fork of kh4f's Manual Sorting 3.2.4 (MIT).\n" + code
    (ROOT / "main.js").write_text(code, encoding="utf-8", newline="\n")

if __name__ == "__main__":
    main()
