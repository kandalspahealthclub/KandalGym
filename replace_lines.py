import sys

def replace_lines(filepath, line_map):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line_num, new_content in line_map.items():
        # Line numbers are 1-indexed
        if 1 <= line_num <= len(lines):
            # Preserve original indentation if possible, but here we provide the full line
            lines[line_num - 1] = new_content + '\n'
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Lines replaced successfully.")

if __name__ == "__main__":
    replace_lines('app.js', {
        51: "                last_eval: 'Última Avaliação',",
        8876: "                data: { name: c.nome, msg: 'ATÉ AMANHÃ! (SAÍDA)', valid: true, photo: userPhoto || null }",
        8899: "                    data: { name: c.nome, msg: 'SEM CRÉDITOS', valid: false, photo: userPhoto || null }"
    })
