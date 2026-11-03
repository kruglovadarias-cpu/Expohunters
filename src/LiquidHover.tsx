// Liquid Distortion — Originkit, адаптация приложенного пользователем компонента.
// Те же fluid-shaders; ввод движения идёт из общего follower, а не mouseenter canvas.
import { useEffect, useRef, type RefObject } from 'react';
import { VERT, FRAG_ADVECT, FRAG_DIVERGENCE, FRAG_PRESSURE, FRAG_GRAD_SUB, FRAG_POINT, FRAG_OUTPUT } from './liquidShaders';

export interface LiquidMotion { dx: number; dy: number; strength?: number }
interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  motionRef: RefObject<LiquidMotion>;
  resolution: number;
  cursorSize: number;
  intensity: number;
}
interface Target {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  attach: (slot: number) => number;
}
interface DoubleTarget { read: Target; write: Target; swap: () => void }
interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }

export default function LiquidHover({ videoRef, motionRef, resolution, cursorSize, intensity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = canvas.parentElement!;
    const media = videoRef.current;
    if (!media) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl || !gl.getExtension('OES_texture_float') || !gl.getExtension('OES_texture_float_linear') || !gl.getExtension('WEBGL_color_buffer_float')) return;
    const programs: WebGLProgram[] = [];
    const shaders: WebGLShader[] = [];
    const buffers: WebGLBuffer[] = [];
    let targets: Target[] = [];
    let imageTexture: WebGLTexture | null = null;
    let raf = 0;
    let disposed = false;
    let uploadedTime = -1;
    let imageAspect = 16 / 9;
    let width = 0;
    let height = 0;
    let simW = 0;
    let simH = 0;
    let velocity: DoubleTarget;
    let pressure: DoubleTarget;
    let output: DoubleTarget;
    let divergence: Target;
    let last = performance.now();

    const deleteTargets = () => {
      for (const t of targets) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.texture); }
      targets = [];
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      deleteTargets();
      programs.forEach(p => gl.deleteProgram(p));
      shaders.forEach(s => gl.deleteShader(s));
      buffers.forEach(b => gl.deleteBuffer(b));
      if (imageTexture) gl.deleteTexture(imageTexture);
      delete container.dataset.liquid;
    };
    const makeProgram = (fragment: string): Program => {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader error');
        return shader;
      };
      const program = gl.createProgram()!;
      programs.push(program);
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program error');
      const uniforms: Program['uniforms'] = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i)!.name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    };
    const makeTarget = (w: number, h: number): Target => {
      const texture = gl.createTexture()!;
      const fbo = gl.createFramebuffer()!;
      const target = { texture, fbo, width: w, height: h, attach(slot: number) {
        gl.activeTexture(gl.TEXTURE0 + slot); gl.bindTexture(gl.TEXTURE_2D, texture); return slot;
      } };
      targets.push(target);
      target.attach(0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // RGBA float вместо RGB float: поддерживается большим числом WebGL-драйверов.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float framebuffer unsupported');
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
      return target;
    };
    const makeDouble = (): DoubleTarget => {
      const pair: DoubleTarget = { read: makeTarget(simW, simH), write: makeTarget(simW, simH), swap() {
        [pair.read, pair.write] = [pair.write, pair.read];
      } };
      return pair;
    };
    const draw = (target: Target | null = null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
      gl.viewport(0, 0, target?.width ?? canvas.width, target?.height ?? canvas.height);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
    let splat: Program, div: Program, press: Program, gradient: Program, advect: Program, display: Program;
    try {
      splat = makeProgram(FRAG_POINT); div = makeProgram(FRAG_DIVERGENCE); press = makeProgram(FRAG_PRESSURE);
      gradient = makeProgram(FRAG_GRAD_SUB); advect = makeProgram(FRAG_ADVECT); display = makeProgram(FRAG_OUTPUT);
      // Буферы создаются один раз; исходный пример создавал два буфера при каждом draw call.
      const vertices = gl.createBuffer()!, indices = gl.createBuffer()!;
      buffers.push(vertices, indices);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
      gl.clearColor(0, 0, 0, 0);
    } catch { dispose(); return; }

    const resize = () => {
      if (disposed) return;
      width = container.clientWidth; height = container.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(width * 1.2 * dpr));
      const h = Math.max(2, Math.round(height * 1.2 * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const nextH = Math.round(128 + (resolution - 1) * (512 - 128) / 9);
      const nextW = Math.round(nextH * width / height);
      if (nextW !== simW || nextH !== simH) {
        deleteTargets(); simW = nextW; simH = nextH;
        velocity = makeDouble(); output = makeDouble(); pressure = makeDouble(); divergence = makeTarget(simW, simH);
      }
    };
    try { resize(); } catch { dispose(); return; }
    const observer = new ResizeObserver(() => { try { resize(); } catch { dispose(); } });
    observer.observe(container);

    imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const render = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(render);
      const dt = Math.min((now - last) / 1000, .033); last = now;
      if (document.hidden || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !width || !height) return;
      const strength = motionRef.current.strength ?? 1;
      if (strength <= .001) {
        container.dataset.liquid = 'idle';
        return;
      }
      imageAspect = media.videoWidth / media.videoHeight;
      if (uploadedTime !== media.currentTime) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
        uploadedTime = media.currentTime;
      }
      const { dx, dy } = motionRef.current;
      if (Math.abs(dx) + Math.abs(dy) > .04) {
        gl.useProgram(splat.program);
        gl.uniform1i(splat.uniforms.u_input_texture, velocity.read.attach(1));
        gl.uniform1f(splat.uniforms.u_ratio, width / height);
        gl.uniform2f(splat.uniforms.u_point, .5 - Math.max(-.2, Math.min(.2, dx / 120)), .5 + Math.max(-.2, Math.min(.2, dy / 120)));
        gl.uniform3f(splat.uniforms.u_point_value, dx * 6, -dy * 6, 0);
        const radius = cursorSize / height;
        gl.uniform1f(splat.uniforms.u_point_size, radius * radius);
        draw(velocity.write); velocity.swap();
        gl.uniform1i(splat.uniforms.u_input_texture, output.read.attach(1));
        const power = 5 + ((intensity / 100 - .1) * 45) / .9;
        gl.uniform3f(splat.uniforms.u_point_value, power * .001, 0, 0);
        draw(output.write); output.swap();
      }
      gl.useProgram(div.program);
      gl.uniform2f(div.uniforms.u_texel, 1 / simW, 1 / simH);
      gl.uniform1i(div.uniforms.u_velocity_texture, velocity.read.attach(1)); draw(divergence);
      gl.useProgram(press.program);
      gl.uniform2f(press.uniforms.u_texel, 1 / simW, 1 / simH);
      gl.uniform1i(press.uniforms.u_divergence_texture, divergence.attach(1));
      for (let i = 0; i < 8; i++) {
        gl.uniform1i(press.uniforms.u_pressure_texture, pressure.read.attach(2)); draw(pressure.write); pressure.swap();
      }
      gl.useProgram(gradient.program);
      gl.uniform2f(gradient.uniforms.u_texel, 1 / simW, 1 / simH);
      gl.uniform1i(gradient.uniforms.u_pressure_texture, pressure.read.attach(1));
      gl.uniform1i(gradient.uniforms.u_velocity_texture, velocity.read.attach(2)); draw(velocity.write); velocity.swap();
      gl.useProgram(advect.program);
      gl.uniform2f(advect.uniforms.u_texel, 1 / simW, 1 / simH);
      gl.uniform2f(advect.uniforms.u_output_textel, 1 / simW, 1 / simH);
      gl.uniform1i(advect.uniforms.u_velocity_texture, velocity.read.attach(1));
      gl.uniform1i(advect.uniforms.u_input_texture, velocity.read.attach(1));
      gl.uniform1f(advect.uniforms.u_dt, dt);
      gl.uniform1f(advect.uniforms.u_dissipation, Math.pow(.97, dt * 60)); draw(velocity.write); velocity.swap();
      gl.uniform1i(advect.uniforms.u_velocity_texture, velocity.read.attach(1));
      gl.uniform1i(advect.uniforms.u_input_texture, output.read.attach(2));
      gl.uniform1f(advect.uniforms.u_dt, 8 * dt);
      gl.uniform1f(advect.uniforms.u_dissipation, Math.pow(.98, dt * 60)); draw(output.write); output.swap();
      gl.useProgram(display.program);
      gl.uniform1i(display.uniforms.u_velocity_texture, velocity.read.attach(2));
      gl.uniform1i(display.uniforms.u_output_texture, output.read.attach(1));
      gl.uniform1f(display.uniforms.u_ratio, width / height);
      gl.uniform1f(display.uniforms.u_img_ratio, imageAspect);
      gl.uniform1f(display.uniforms.u_disturb_power, intensity / 100 * strength);
      gl.uniform1f(display.uniforms.u_canvas_scale, 1);
      gl.uniform1f(display.uniforms.u_inner_scale, 5 / 6);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.uniform1i(display.uniforms.u_text_texture, 0); draw();
      container.dataset.liquid = 'ready';
    };
    raf = requestAnimationFrame(render);
    const onLost = (event: Event) => { event.preventDefault(); dispose(); };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      dispose();
    };
  }, [videoRef, motionRef, resolution, cursorSize, intensity]);
  return <canvas ref={canvasRef} className="liquid-canvas" aria-hidden="true" />;
}
