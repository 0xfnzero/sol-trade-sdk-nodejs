import {it,expect,vi} from 'vitest';
import {validateSimulationResponse,simulate,simulationOutput} from '../../examples/_simulation';
it.each([{},null,{result:null},{result:{value:{}}},{result:{value:null}},{error:{code:-1}}])('rejects missing execution result %#',r=>expect(()=>validateSimulationResponse(r)).toThrow());
it('explicit null error is required for success',()=>expect(validateSimulationResponse({result:{value:{err:null}}})).toBeNull());
it('requires explicit simulation with evidence path',()=>{
 expect(()=>simulationOutput(['--simulation-out','x'])).toThrow();
 expect(()=>simulationOutput(['--simulate','--simulation-out'])).toThrow();
});
it('sends only simulation, preserves wire and bounds network wait',async()=>{
 const wire=Buffer.from([1,2,3,255]);const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  const v=JSON.parse(init!.body as string);expect(v.method).toBe('simulateTransaction');expect(v.params[0]).toBe(wire.toString('base64'));expect(v.params[1].minContextSlot).toBe(123);expect(v.params[1].sigVerify).toBe(false);expect(init!.signal).toBeInstanceOf(AbortSignal);
  return new Response(JSON.stringify({result:{value:{err:{InstructionError:[0,'failure']}}}}),{status:200});
 });
 try{await expect(simulate(wire,123n)).rejects.toThrow('Simulation failed')}finally{spy.mockRestore()}
});
