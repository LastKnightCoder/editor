import type { BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function verifyStickman(
  window: BrowserWindow,
  run: BrowserWindow["webContents"]["executeJavaScript"],
  wait: (condition: string) => Promise<void>,
  phase: string,
  savedPath: string
) {
  const nodes = "window.whiteboardTest.snapshot().children";
  if (phase !== "initial") {
    const expected = JSON.parse(await readFile(savedPath, "utf8"));
    assert.deepEqual(await run(nodes), expected);
    const missing = phase === "disabled" || phase === "missing";
    await wait(
      missing
        ? "Boolean(document.querySelector('[data-unknown-element]'))"
        : "Boolean(document.querySelector('[data-stickman]'))"
    );
    assert.equal(await run("Boolean(document.querySelector('[data-stickman]'))"), !missing);
    if (!missing) assert.equal((await run("window.whiteboardTest.style()")).body, "bean");
    await run("window.whiteboardTest.save()");
    assert.deepEqual(JSON.parse(await readFile(savedPath, "utf8")), expected);
    return;
  }
  await run(`document.querySelector('button[aria-label="扩展工具"]').click()`);
  await wait(
    `[...document.querySelectorAll('[data-open="true"] button')].some(b=>b.textContent.includes('人物'))`
  );
  await run(
    `[...document.querySelectorAll('[data-open="true"] button')].find(b=>b.textContent.includes('人物')).click()`
  );
  await wait("Boolean(document.querySelector('.tau-stickman-pose'))");
  await run("document.querySelector('.tau-stickman-pose').click()");
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: 300,
    y: 220,
    button: "left",
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: 300,
    y: 220,
    button: "left",
    clickCount: 1,
  });
  await wait(`${nodes}.length===1 && Boolean(document.querySelector('[data-stickman]'))`);
  const node = (await run(nodes))[0];
  const parity = await run("window.whiteboardTest.parity()");
  assert.ok(parity.renderCases > 0 && parity.schematicCases > 0);
  console.log("人物等价验证", parity);
  assert.equal(await run("window.whiteboardTest.connections()"), true);
  assert.equal(node.type, "taunote.stickman.figure");
  assert.equal(node.schemaVersion, 1);
  assert.deepEqual(node.data, { pose: "stand", body: "classic", tint: "color", flip: false });
  await run(`document.querySelector('button[aria-label="形体"]').click()`);
  await wait(`Boolean(document.querySelector('[data-open="true"] button[aria-label="豆豆"]'))`);
  await run(`document.querySelector('[data-open="true"] button[aria-label="豆豆"]').click()`);
  await wait(`${nodes}[0].data.body==='bean'`);
  await wait(`window.whiteboardTest.style().then(value=>value?.body==='bean')`);
  await run(`document.querySelector('button[aria-label="形体"]').click()`);
  await run(`document.querySelector('button[aria-label="水平翻转"]').click()`);
  assert.equal(await run(`${nodes}[0].data.flip`), true);
  await run("window.whiteboardTest.execute('tau.history.undo')");
  assert.equal(await run(`${nodes}[0].data.flip`), false);
  await run("window.whiteboardTest.execute('tau.history.redo')");
  assert.equal(await run(`${nodes}[0].data.flip`), true);
  await wait("document.querySelectorAll('[data-resize-handle]').length===4");
  const handle = await run(
    `(() => {const r=document.querySelector('[data-resize-handle="bottom-right"] circle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`
  );
  const before = (await run(nodes))[0];
  for (const [type, dx, dy] of [
    ["mouseDown", 0, 0],
    ["mouseMove", 70, 70],
    ["mouseUp", 70, 70],
  ] as const)
    window.webContents.sendInputEvent({
      type,
      x: Math.round(handle.x + dx),
      y: Math.round(handle.y + dy),
      button: "left",
      clickCount: 1,
    });
  await wait(`${nodes}[0].width > ${before.width}`);
  const resized = (await run(nodes))[0];
  assert.ok(Math.abs(resized.width / resized.height - before.width / before.height) < 0.001);
  await run("window.whiteboardTest.execute('tau.history.undo')");
  assert.equal(await run(`${nodes}[0].width`), before.width);
  await run("window.whiteboardTest.execute('tau.history.redo')");
  const paths = await run(`document.querySelector('[data-stickman]').innerHTML`);
  await run("window.whiteboardTest.sketch()");
  await wait(`document.querySelector('[data-stickman]').innerHTML !== ${JSON.stringify(paths)}`);
  await wait("document.querySelectorAll('#standalone-schematic path').length>0");
  await run(
    `window.whiteboardTest.update(${JSON.stringify(node.id)}, {data:{pose:'think',body:'bean',tint:'mono',flip:true}})`
  );
  await wait(`document.querySelector('[data-stickman] text')?.textContent==='?'`);
  const copied = await run(
    `(() => {const board=document.querySelector('[data-whiteboard-root]');board.focus();const clipboardData=new DataTransfer();board.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData}));const value=JSON.parse(clipboardData.getData('application/json'));board.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));return value;})()`
  );
  assert.equal(copied.elements[0].type, node.type);
  await wait(`${nodes}.length===2`);
  const exported = await run("window.whiteboardTest.capture()");
  assert.equal(exported?.type, "image/png");
  assert.ok(exported.size > 100);
  const duplicated = await run(nodes);
  assert.notEqual(duplicated[0].id, duplicated[1].id);
  assert.deepEqual(duplicated[0].data, duplicated[1].data);
  await run("window.whiteboardTest.readonly(true)");
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(await run(`window.whiteboardTest.update(${JSON.stringify(node.id)}, {x:0})`), false);
  await run("window.whiteboardTest.save()");
  return { parity, exported };
}
