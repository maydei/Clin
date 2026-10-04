import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { encodeProjectAsync, decodeProjectAsync } from './project-file';
import { createEditorState } from './model';
let worker: FakeWorker;
class FakeWorker {
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror: ((event: {message: string}) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { worker=this; }
}
beforeEach(()=>vi.stubGlobal('Worker',FakeWorker));
afterEach(()=>vi.unstubAllGlobals());
const project={version:1 as const,name:'test',updatedAt:'2026-09-16',sources:[],state:createEditorState()};
it('resolves encoded bytes and releases the worker',async()=>{
 const pending=encodeProjectAsync(project);
 const bytes=new Uint8Array([1,2,3]); worker.onmessage!({data:{value:bytes}});
 expect(await pending).toBe(bytes); expect(worker.terminate).toHaveBeenCalledOnce();
});
it('propagates malformed project errors and releases the worker',async()=>{
 const pending=decodeProjectAsync(new Uint8Array());
 worker.onmessage!({data:{error:'Archivo inválido'}});
 await expect(pending).rejects.toThrow('Archivo inválido'); expect(worker.terminate).toHaveBeenCalledOnce();
});
it('rejects already cancelled requests without starting a worker',async()=>{
 const controller=new AbortController(); controller.abort();
 await expect(encodeProjectAsync(project,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('cancels in-flight decoding and terminates its worker',async()=>{
 const controller=new AbortController(); const pending=decodeProjectAsync(new Uint8Array(),controller.signal);
 controller.abort(); await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(worker.terminate).toHaveBeenCalledOnce();
});
it.each(['worker crashed',''])('reports worker execution failure: %s',async(message)=>{
 const pending=decodeProjectAsync(new Uint8Array()); worker.onerror!({message});
 await expect(pending).rejects.toThrow(message||'No se pudo procesar el proyecto.');expect(worker.terminate).toHaveBeenCalledOnce();
});
