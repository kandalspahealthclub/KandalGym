import sys

def final_fix(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Line numbers are 1-indexed
    # Line 8876
    lines[8875] = "                data: { name: c.nome, msg: 'ATÉ AMANHÃ! (SAÍDA)', valid: true, photo: userPhoto || null }\n"
    # Line 8899
    lines[8898] = "                    data: { name: c.nome, msg: 'SEM CRÉDITOS', valid: false, photo: userPhoto || null }\n"
    # Line 51
    lines[50] = "                last_eval: 'Última Avaliação',\n"
    
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(lines)
    print("Final fix applied.")

if __name__ == "__main__":
    final_fix('app.js')
