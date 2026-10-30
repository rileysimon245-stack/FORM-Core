import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// API endpoint for AI program generation
app.post('/api/generate-program', async (req, res) => {
  try {
    const { goal, equipment, daysPerWeek, duration, experience, preferredDays, notes } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
      return res.json({
        success: false,
        fallback: true,
        message: 'Ключ Gemini API не настроен. Активирован встроенный спортивный генератор.',
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Ты — элитный тренер по бодибилдингу и силовой подготовке. Составь научно обоснованную программу тренировок на русском языке:
- Цель: ${goal || 'Набор мышечной массы'}
- Доступное оборудование: ${equipment || 'Тренажерный зал'}
- Количество тренировок в неделю: ${daysPerWeek || 3}
- Длительность одного занятия: ${duration || 60} минут
- Уровень подготовки: ${experience || 'Средний'}
- Предпочтительные дни: ${Array.isArray(preferredDays) ? preferredDays.join(', ') : 'Пн, Ср, Пт'}
- Особые пожелания и ограничения: ${notes || 'Нет'}

Требования:
1. Обязательно учитывай время восстановления мышц: не ставь одни и те же основные мышечные группы подряд.
2. Подбери оптимальное количество подходов (3-4) и повторений под цель.
3. Укажи правильные мышечные группы (строго из списка: chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs, lowerback, traps).

Верни СТРОГО чистый JSON по следующей схеме (без markdown разметки):
{
  "name": "Название программы (например, Силовой сплит 3 дня)",
  "description": "Краткое описание распределения нагрузки и периодизации",
  "goal": "${goal}",
  "daysPerWeek": ${daysPerWeek || 3},
  "workouts": [
    {
      "dayName": "День 1: Грудь и Трицепс",
      "targetMuscleGroups": ["chest", "triceps", "shoulders"],
      "estimatedDuration": ${duration || 60},
      "exercises": [
        {
          "name": "Жим штанги лежа",
          "targetMuscle": "chest",
          "sets": 4,
          "reps": 8,
          "targetWeight": 65,
          "isBodyweight": false,
          "restSeconds": 90
        }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return res.json({
      success: true,
      program: parsed,
    });
  } catch (err: any) {
    console.error('Gemini API generation error:', err);
    return res.json({
      success: false,
      fallback: true,
      message: 'Ошибка подключения к серверу ИИ. Активирован надежный локальный генератор.',
    });
  }
});

async function start() {
  // Always serve static assets from public/ (including images, icons, manifests)
  app.use(express.static(path.resolve(__dirname, 'public')));

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FORM app backend & client running at http://0.0.0.0:${PORT}`);
  });
}

start();
