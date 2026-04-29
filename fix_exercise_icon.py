import sys

def fix_exercise_icon(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    start = -1
    end = -1
    for i, line in enumerate(lines):
        if 'getExerciseIcon(cat) {' in line:
            start = i
        if start != -1 and line.strip() == '}' and i > start:
            # Check context to make sure it's the right function end
            if i + 2 < len(lines) and 'getMuscleColor' in lines[i+2]:
                end = i
                break
            # Fallback if the next function is different
            if 'return iconMap[cat]' in lines[i-1]:
                end = i
                break
    
    if start != -1 and end != -1:
        new_func = [
            "    getExerciseIcon(cat) {\n",
            "        const iconMap = {\n",
            "            'Perna': '🦵',\n",
            "            'Costas': '🧱',\n",
            "            'Peito': '👕',\n",
            "            'Ombros': '🏋️',\n",
            "            'Cárdio': '🏃',\n",
            "            'Abdominais': '🧘',\n",
            "            'Alongamentos': '🤸',\n",
            "            'Geral': '⚙️',\n",
            "            'Bicep': '💪',\n",
            "            'Tricep': '💪',\n",
            "            'Bíceps': '💪',\n",
            "            'Deltoides': '🏋️',\n",
            "            'Dorsal': '🧱',\n",
            "            'Isquiotibiais': '🦵',\n",
            "            'Quadríceps': '🦵'\n",
            "        };\n",
            "        return iconMap[cat] || '⚙️';\n",
            "    }\n"
        ]
        lines[start:end+1] = new_func
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.writelines(lines)
        print("Function fixed.")

if __name__ == "__main__":
    fix_exercise_icon('app.js')
