import sys

def fix_broadcast_photos(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    start_func = -1
    for i, line in enumerate(lines):
        if 'processarLeituraQR(qrId) {' in line:
            start_func = i
            break
    
    if start_func != -1:
        # We know userPhoto is defined now in our previous edit
        # It was inserted around line 8284
        for i in range(start_func, min(start_func + 300, len(lines))):
            lines[i] = lines[i].replace('photo: c.photoUrl || null', 'photo: userPhoto || null')
        
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.writelines(lines)
        print("Broadcast photos fixed.")

if __name__ == "__main__":
    fix_broadcast_photos('app.js')
