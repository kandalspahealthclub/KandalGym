import sys

def restore_emojis(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Restore getFoodEmoji
    start_food = -1
    end_food = -1
    for i, line in enumerate(lines):
        if 'getFoodEmoji(category) {' in line:
            start_food = i
        if start_food != -1 and line.strip() == '}' and i > start_food:
            if 'return emojiMap[category]' in lines[i-1]:
                end_food = i
                break
    
    if start_food != -1 and end_food != -1:
        new_food = [
            "    getFoodEmoji(category) {\n",
            "        const emojiMap = {\n",
            "            'Carne': '🥩',\n",
            "            'Peixe': '🐟',\n",
            "            'Leguminosas': '🫘',\n",
            "            'Laticinios': '🥛',\n",
            "            'Cereais': '🥣',\n",
            "            'Horticolas': '🥦',\n",
            "            'Fruta': '🍎',\n",
            "            'Gorduras/Oleos': '🥑',\n",
            "            'Bebidas Energeticas': '⚡',\n",
            "            'Outros': '🥗'\n",
            "        };\n",
            "        return emojiMap[category] || '🥗';\n",
            "    }\n"
        ]
        lines[start_food:end_food+1] = new_food
    
    # Re-evaluate indices because we changed the list length
    # Restore getMuscleIcon
    start_muscle = -1
    end_muscle = -1
    for i, line in enumerate(lines):
        if 'getMuscleIcon(cat) {' in line:
            start_muscle = i
        if start_muscle != -1 and line.strip() == '}' and i > start_muscle:
            if 'return iconMap[cat]' in lines[i-1]:
                end_muscle = i
                break
    
    if start_muscle != -1 and end_muscle != -1:
        new_muscle = [
            "    getMuscleIcon(cat) {\n",
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
        lines[start_muscle:end_muscle+1] = new_muscle

    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(lines)
    print("Emoji maps restored.")

if __name__ == "__main__":
    restore_emojis('app.js')
