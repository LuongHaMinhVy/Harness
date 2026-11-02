# Tạo lại từng đoạn thuyết minh (Gemini TTS free tier chỉ 3 lần/phút), gộp kết quả vào audio_meta.json.
import json, subprocess, sys, time
ids = sys.argv[1:]
req = json.load(open('audio_request.json', encoding='utf8'))
for i, vid in enumerate(ids):
    if i: time.sleep(25)
    meta = json.load(open('audio_meta.json', encoding='utf8'))
    line = next(l for l in req['lines'] if l['id'] == vid)
    one = dict(req, lines=[{k: v for k, v in line.items() if k != 'tts_model'}])
    if 'tts_model' in line:  # dòng có model riêng (vd. hết quota ngày của model chính)
        one['tts_model'] = line['tts_model']
    json.dump(one, open('audio_request.one.json', 'w', encoding='utf8'), ensure_ascii=False)
    subprocess.run(['node', 'tts.mjs', 'audio_request.one.json'], check=False)
    new = json.load(open('audio_meta.json', encoding='utf8'))
    got = {v['id']: v for v in new.get('voices', [])}
    voices = {v['id']: v for v in meta.get('voices', [])}
    if vid in got and got[vid]['path'].endswith(f'{vid}.wav'):
        voices[vid] = got[vid]
    else:
        print('!! thiếu', vid, new.get('anomalies'))
    meta['voices'] = [voices[k] for k in ['s1','s2','s3','s4','s5'] if k in voices]
    meta['total_duration_s'] = sum(v['duration_s'] for v in meta['voices'])
    meta.pop('anomalies', None)
    json.dump(meta, open('audio_meta.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
import os; os.remove('audio_request.one.json')
print([(v['id'], v['duration_s']) for v in meta['voices']])
