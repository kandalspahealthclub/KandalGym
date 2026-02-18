const mockState = {
    exercises: [
        { id: 1, name: "Squats (Agachamento)", videoUrl: "https://www.youtube.com/embed/gcNh17Ckjgg", category: "Perna", muscle: "Quadríceps" },
        { id: 2, name: "Deadlift (Peso Morto)", videoUrl: "https://www.youtube.com/embed/r4MzxtBKyNE", category: "Costas", muscle: "Isquiotibiais" },
        { id: 3, name: "Bench Press (Supino)", videoUrl: "https://www.youtube.com/embed/vcBig73ojpE", category: "Peito", muscle: "Peitoral" },
        { id: 4, name: "Shoulder Press (Press de Ombros)", videoUrl: "https://www.youtube.com/embed/qEwK6jnzpxk", category: "Ombros", muscle: "Deltoides" },
        { id: 5, name: "Bicep Curls (Rosca Direta)", videoUrl: "https://www.youtube.com/embed/ykJmrZ5v0Oo", category: "Braços", muscle: "Bíceps" },
        { id: 6, name: "Lat Pulldown (Puxada)", videoUrl: "https://www.youtube.com/embed/CAwf7n6Luuc", category: "Costas", muscle: "Dorsal" }
    ],
    teachers: [
        { id: 1, name: "João Duarte", email: "professor@fitnesspro.com", password: "123" }
    ],
    clients: [
        { id: 101, name: "Ana Silva", email: "ana@gmail.com", password: "123", status: "Ativo", lastEvaluation: "2024-01-15", goal: "Hipertrofia", teacherId: 1 },
        { id: 102, name: "Ricardo Santos", email: "ricardo@gmail.com", password: "123", status: "Ativo", lastEvaluation: "2024-01-20", goal: "Perda de Peso", teacherId: 1 },
        { id: 103, name: "Maria Oliveira", email: "maria@gmail.com", password: "123", status: "Inativo", lastEvaluation: "2023-11-10", goal: "Condicionamento", teacherId: 1 }
    ],
    trainingPlans: {
        101: [
            {
                title: "Treino A - Inferiores",
                exercises: [
                    { id: 1, name: "Squats", sets: 4, reps: "10-12", weightLog: [60, 60, 65, 65], observations: "Manter as costas direitas" },
                    { id: 6, name: "Lat Pulldown", sets: 3, reps: "12", weightLog: [40, 45, 45], observations: "Foco na contração dorsal" }
                ]
            }
        ]
    },
    mealPlans: {
        101: {
            title: "Dieta Hipertrofia",
            meals: [
                { time: "08:00", name: "Pequeno Almoço", items: "Aveia com whey e banana" },
                { time: "13:00", name: "Almoço", items: "Peito de frango, arroz integral e brócolos" },
                { time: "20:00", name: "Jantar", items: "Salmão com batata doce" }
            ]
        }
    },
    evaluations: {
        101: [
            {
                date: "15/01/2024",
                weight: 65,
                height: 165,
                fatPercentage: 22,
                muscleMass: 48,
                water: 55,
                boneMass: 2.5,
                visceralFat: 4,
                metabolicAge: 25,
                basalMetabolism: 1450,
                chest: 90,
                waist: 70,
                abdominal: 75,
                hip: 95,
                thigh: 55
            },
            { date: "10/12/2023", weight: 67, fatPercentage: 24, muscleMass: 47 }
        ]
    },
    messages: [
        { from: "teacher", to: 101, text: "Olá Ana, como correu o treino de hoje?", time: "14:30" },
        { from: "101", to: "teacher", text: "Correu bem! Aumentei o peso no agachamento.", time: "15:00" }
    ],
    foods: [
        { id: 1, name: "Peito de Frango", protein: 31, carbs: 0, fat: 3.6, kcal: 165, category: "Carne" },
        { id: 2, name: "Arroz Integral", protein: 2.6, carbs: 23, fat: 0.9, kcal: 111, category: "Cereais" },
        { id: 3, name: "Ovo Cozido", protein: 13, carbs: 1.1, fat: 11, kcal: 155, category: "Laticínios" }
    ],
    exerciseCategories: [
        "Perna", "Costas", "Peito", "Ombros", "Braços", "Cárdio", "Abdominais", "Alongamentos", "Dorsal", "Geral"
    ],
    foodCategories: [
        "Carne", "Peixe", "Leguminosas", "Laticínios", "Cereais",
        "Hortícolas", "Fruta", "Gorduras/Óleos", "Bebidas Energéticas", "Outros"
    ],
    trainingHistory: {},
    anamnesis: {},
    qrClients: []
};
