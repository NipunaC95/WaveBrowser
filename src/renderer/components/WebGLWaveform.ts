// xAI High-Performance WebGL Shader-Based Waveform Engine
export class WebGLWaveformRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private peakTexture: WebGLTexture | null = null;

  // Uniform locations
  private uBarsCountLoc: WebGLUniformLocation | null = null;
  private uProgressLoc: WebGLUniformLocation | null = null;
  private uHoverProgressLoc: WebGLUniformLocation | null = null;
  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uIsPlayingLoc: WebGLUniformLocation | null = null;

  private currentPeaks: Float32Array | null = null;
  private barsCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): void {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    }) || (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('WebGL not supported');
      return;
    }
    this.gl = gl;

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // xAI Monochromatic High-Precision Shader
    const fsSource = `
      precision highp float;
      varying vec2 v_uv;

      uniform sampler2D u_peaksTex;
      uniform float u_barsCount;
      uniform float u_progress;
      uniform float u_hoverProgress;
      uniform vec2 u_resolution;
      uniform float u_isPlaying;

      void main() {
        if (u_barsCount <= 0.0) {
          discard;
        }

        // Discrete geometric bars
        float barIndex = floor(v_uv.x * u_barsCount);
        float barCoord = fract(v_uv.x * u_barsCount);
        float gap = 0.24; // Precision gap

        // Gap spacing between bars
        if (barCoord < gap * 0.5 || barCoord > (1.0 - gap * 0.5)) {
          // Hairline center guideline
          if (abs(v_uv.y - 0.5) < 0.01) {
            gl_FragColor = vec4(1.0, 1.0, 1.0, 0.05);
            return;
          }
          discard;
        }

        // Sample peak amplitude from 1D GPU texture (0.0 to 1.0)
        float sampleU = (barIndex + 0.5) / u_barsCount;
        float peak = texture2D(u_peaksTex, vec2(sampleU, 0.5)).r;
        peak = max(0.05, peak * 0.94);

        float distFromCenter = abs(v_uv.y - 0.5) * 2.0;

        // Render peak bar
        if (distFromCenter <= peak) {
          if (v_uv.x <= u_progress) {
            // Played: xAI Pure Brilliant White & Silver
            float sheen = 0.92 + 0.08 * (1.0 - distFromCenter / peak);
            gl_FragColor = vec4(vec3(sheen), 1.0);
          } else {
            // Unplayed: Architectural Dark Gray
            gl_FragColor = vec4(0.38, 0.38, 0.40, 0.35);
          }
          return;
        }

        // Razor-sharp 1px pure white playhead line
        float pixelX = v_uv.x * u_resolution.x;
        float playheadPixelX = u_progress * u_resolution.x;
        float distToPlayhead = abs(pixelX - playheadPixelX);

        if (distToPlayhead < 1.2) {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
          return;
        } else if (distToPlayhead < 3.5) {
          float glow = (1.0 - distToPlayhead / 3.5) * 0.35;
          gl_FragColor = vec4(1.0, 1.0, 1.0, glow);
          return;
        }

        // Hover guideline
        if (u_hoverProgress >= 0.0) {
          float hoverPixelX = u_hoverProgress * u_resolution.x;
          float distToHover = abs(pixelX - hoverPixelX);
          if (distToHover < 1.0) {
            gl_FragColor = vec4(1.0, 1.0, 1.0, 0.3);
            return;
          }
        }

        // Subtle baseline
        if (abs(v_uv.y - 0.5) < 0.01) {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 0.05);
          return;
        }

        discard;
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;

    // Full-screen quad
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.uBarsCountLoc = gl.getUniformLocation(prog, 'u_barsCount');
    this.uProgressLoc = gl.getUniformLocation(prog, 'u_progress');
    this.uHoverProgressLoc = gl.getUniformLocation(prog, 'u_hoverProgress');
    this.uResolutionLoc = gl.getUniformLocation(prog, 'u_resolution');
    this.uIsPlayingLoc = gl.getUniformLocation(prog, 'u_isPlaying');

    this.peakTexture = gl.createTexture();
  }

  private compileShader(type: number, src: string): WebGLShader | null {
    if (!this.gl) return null;
    const s = this.gl.createShader(type)!;
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(s));
      this.gl.deleteShader(s);
      return null;
    }
    return s;
  }

  setPeaks(peaks: Float32Array): void {
    if (!this.gl || !this.peakTexture) return;
    this.currentPeaks = peaks;
    this.barsCount = peaks.length;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.peakTexture);

    const texData = new Uint8Array(this.barsCount);
    for (let i = 0; i < this.barsCount; i++) {
      texData[i] = Math.max(0, Math.min(255, Math.floor(peaks[i] * 255)));
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      this.barsCount,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      texData
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  render(progress: number, hoverProgress = -1, isPlaying = false): void {
    if (!this.gl || !this.program || !this.currentPeaks) return;

    const gl = this.gl;
    this.updateViewport();

    gl.useProgram(this.program);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.peakTexture);
    const texLoc = gl.getUniformLocation(this.program, 'u_peaksTex');
    gl.uniform1i(texLoc, 0);

    gl.uniform1f(this.uBarsCountLoc, this.barsCount);
    gl.uniform1f(this.uProgressLoc, Math.max(0, Math.min(1, progress)));
    gl.uniform1f(this.uHoverProgressLoc, hoverProgress);
    gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uIsPlayingLoc, isPlaying ? 1.0 : 0.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  updateViewport(): void {
    if (!this.gl) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor((this.canvas.clientWidth || 800) * dpr);
    const h = Math.floor((this.canvas.clientHeight || 48) * dpr);

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  destroy(): void {
    if (!this.gl) return;
    if (this.program) this.gl.deleteProgram(this.program);
    if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
    if (this.peakTexture) this.gl.deleteTexture(this.peakTexture);
    this.gl = null;
  }
}
