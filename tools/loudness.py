#!/usr/bin/env python3
"""Meet de luidheid (EBU R128) van alle stemopnames en schrijft per map een gain.json.

js/sim.js leest die tabel en js/audio.js past de gain per regel toe (de mp3's zelf blijven
ongewijzigd, ook de lipsync-metingen). Regels:
- de speler (pA/pB/pC) gaat precies naar -20 LUFS: de drie antwoorden klinken even luid, zodat
  het volume niet verraadt welk antwoord 'goed' is;
- andere personages gaan naar -18 LUFS, maar houden 1/3 van hun afwijking: fluisteren blijft
  zachter dan schreeuwen, alleen niet meer 15-18 LU maar hooguit ~6 LU.
- de piek na de gain blijft onder -1 dBFS (de gain wordt zo nodig kleiner gemaakt).
Gebruik: python3 tools/loudness.py   (vanuit de hoofdmap, ffmpeg nodig)
"""
import json, os, re, subprocess, glob

DIRS = ['audio', 'audio/kantine', 'audio/henk']

def measure(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=sample,volumedetect', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    summ = out[out.rfind('Summary:'):]
    lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summ).group(1))
    peak = float(re.search(r'max_volume:\s+(-?[\d.]+) dB', out).group(1))
    return lufs, peak

def main():
    for d in DIRS:
        table = {}
        for f in sorted(glob.glob(os.path.join(d, '*.mp3'))):
            vid = os.path.splitext(os.path.basename(f))[0]
            lufs, peak = measure(f)
            if vid in ('pA', 'pB', 'pC'):
                gdb = -20.0 - lufs
            else:
                gdb = (-18.0 - lufs) * 2 / 3
            gdb = min(gdb, -1.0 - peak)  # piek blijft onder -1 dBFS
            gdb = max(-10.0, min(14.0, gdb))
            table[vid] = {'lufs': lufs, 'peak': peak, 'db': round(gdb, 2), 'gain': round(10 ** (gdb / 20), 3)}
            print(f'{f:28s} {lufs:6.1f} LUFS  piek {peak:6.1f} dB  -> {gdb:+5.1f} dB  ({lufs + gdb:6.1f} LUFS)')
        # Controle: de drie antwoorden van de speler mogen na correctie hooguit 3 LU verschillen.
        res = [table[k]['lufs'] + table[k]['db'] for k in ('pA', 'pB', 'pC') if k in table]
        if res and max(res) - min(res) > 3:
            print(f'LET OP: {d}: antwoorden pA/pB/pC verschillen {max(res) - min(res):.1f} LU (> 3)')
        with open(os.path.join(d, 'gain.json'), 'w') as fh:
            json.dump({k: v['gain'] for k, v in table.items()}, fh, indent=1)

if __name__ == '__main__':
    main()
