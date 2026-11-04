"""Render the isolated foreground wave animation; requires ffmpeg, Pillow, NumPy, SciPy."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'design' / 'portfolio-waves'


def render(output):
    config = json.loads((ASSETS / 'config.json').read_text())
    width, height = config['width'], config['height']
    fps, duration = config['fps'], config['durationSeconds']
    count = round(fps * duration)
    card, wave = config['card'], config['waves']
    background = np.array(Image.open(ASSETS / 'background.png').convert('RGB').resize(
        (width, height), Image.Resampling.LANCZOS))
    texture = np.array(Image.open(ASSETS / 'foreground.png').convert('RGB'), dtype=np.float32)
    margin = math.ceil(max(wave['horizontal'] + wave['horizontalSecondary'],
                           wave['vertical'] + wave['verticalSecondary'])) + 3
    left, top = math.floor(card['x']) - margin, math.floor(card['y']) - margin
    right = math.ceil(card['x'] + card['width']) + margin
    bottom = math.ceil(card['y'] + card['height']) + margin
    roi_background = background[top:bottom, left:right].astype(np.float32)
    x, y = np.meshgrid(np.arange(left, right, dtype=np.float32) - card['x'],
                       np.arange(top, bottom, dtype=np.float32) - card['y'])
    u, v = x / card['width'], y / card['height']
    tau = 2 * np.pi
    kx = (texture.shape[1] - 1) / (card['width'] - 1)
    ky = (texture.shape[0] - 1) / (card['height'] - 1)
    output.parent.mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen([
        'ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-an',
        '-c:v', 'libx264', '-preset', config['encoding']['preset'],
        '-crf', str(config['encoding']['crf']), '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p', '-threads', '4', '-movflags', '+faststart',
        '-g', str(count), '-keyint_min', str(count), '-sc_threshold', '0',
        '-frames:v', str(count), str(output)
    ], stdin=subprocess.PIPE)
    snapshots = {0: 'first', count // 4: 'quarter', count // 2: 'half', count - 1: 'last'}
    frame_differences = []
    previous_roi = None
    maximum_background_difference = 0
    try:
        for index in range(count):
            phase = tau * index / count
            # Integer temporal frequencies make the animation loop seamlessly.
            dx = wave['horizontal'] * np.sin(tau * 1.25 * v - 2 * phase)
            dx += wave['horizontalSecondary'] * np.sin(tau * (.75 * u + .55 * v) + phase)
            dy = wave['vertical'] * np.sin(tau * 1.15 * u + 2 * phase + .7)
            dy += wave['verticalSecondary'] * np.sin(tau * (.9 * v - .35 * u) - 3 * phase)
            sx, sy = x - dx, y - dy
            # One-pixel edge coverage; no blur, feathered border, or duplicated image.
            alpha = np.clip(sx + .5, 0, 1) * np.clip(card['width'] - .5 - sx, 0, 1)
            alpha *= np.clip(sy + .5, 0, 1) * np.clip(card['height'] - .5 - sy, 0, 1)
            coordinates = np.array([sy * ky, sx * kx])
            warped = np.stack([
                map_coordinates(texture[..., channel], coordinates, order=1,
                                mode='nearest', prefilter=False)
                for channel in range(3)
            ], axis=-1)
            coverage = alpha[..., None]
            roi = np.rint(warped * coverage + roi_background * (1 - coverage)).clip(0, 255).astype(np.uint8)
            # Every frame starts from the same background; only this bounded ROI changes.
            frame = background.copy()
            frame[top:bottom, left:right] = roi
            if previous_roi is not None:
                frame_differences.append(float(np.abs(roi.astype(np.int16) - previous_roi).mean()))
            previous_roi = roi.astype(np.int16)
            if index in snapshots:
                regions = [(frame[:top], background[:top]),
                           (frame[bottom:], background[bottom:]),
                           (frame[:, :left], background[:, :left]),
                           (frame[:, right:], background[:, right:])]
                for actual, expected in regions:
                    difference = int(np.abs(actual.astype(np.int16) - expected).max())
                    maximum_background_difference = max(maximum_background_difference, difference)
                assert maximum_background_difference == 0
                Image.fromarray(frame).save(f'/tmp/expo-portfolio-waves-{snapshots[index]}.png')
            process.stdin.write(frame.tobytes())
            if (index + 1) % 120 == 0:
                print(json.dumps({'renderedFrames': index + 1, 'totalFrames': count}), flush=True)
    finally:
        process.stdin.close()
        process.wait()
    if process.returncode:
        raise RuntimeError('MP4 encoding failed')
    if min(frame_differences) <= .01:
        raise RuntimeError('Foreground animation contains frozen frames')
    metadata = {
        **config,
        'file': str(output.relative_to(ROOT)) if output.is_relative_to(ROOT) else str(output),
        'frameCount': count, 'codec': 'H.264', 'pixelFormat': 'yuv420p', 'audio': False,
        'loop': True, 'effect': 'Smooth periodic waves applied only to the foreground card and its outline',
        'background': 'One stationary image, including all background typography and grain',
        'animatedRegionBounds': [left, top, right, bottom],
        'backgroundMaxPixelDifferenceBeforeEncoding': maximum_background_difference,
        'consecutiveForegroundFrameDifferenceMin': min(frame_differences),
        'consecutiveForegroundFrameDifferenceMedian': float(np.median(frame_differences)),
        'sources': {name: hashlib.sha256((ASSETS / name).read_bytes()).hexdigest()
                    for name in ['background.png', 'foreground.png', 'config.json']},
        'sizeBytes': output.stat().st_size,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()
    }
    (ASSETS / 'video.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(metadata, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs' / 'downloads' / 'expohunters-portfolio-waves-8s.mp4')
    render(parser.parse_args().output.resolve())
