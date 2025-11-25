// api/plan-time-split.js
// Simple Vercel serverless handler (Node)
module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? req.body : req.query;
    const total_minutes = Number(body.total_minutes ?? body.totalMinutes);
    const muscle_group = body.muscle_group || body.muscleGroup || null;
    const fitness_level = (body.fitness_level || 'Intermediate');

    // Basic validation
    if (!total_minutes || isNaN(total_minutes) || total_minutes < 0) {
      return res.status(400).json({ error: 'total_minutes must be a positive number' });
    }

    // Edge case: <5 minutes -> micro-break
    if (total_minutes < 5) {
      return res.json({
        total_minutes,
        num_blocks: 1,
        blocks: [{
          id: 1,
          duration_min: Math.max(1, total_minutes),
          type: 'Micro-Break',
          target_muscles: ['Mobility'],
          intensity: 'Low',
          purpose: 'Quick mobility + breathing'
        }],
        meta: { note: 'Less than 5 minutes — micro-break recommended' }
      });
    }

    // Determine number of blocks (simple thresholds)
    let num_blocks;
    if (total_minutes <= 9) num_blocks = 1;
    else if (total_minutes <= 19) num_blocks = 2;
    else if (total_minutes <= 29) num_blocks = total_minutes < 25 ? 2 : 3;
    else if (total_minutes <= 44) num_blocks = 3;
    else num_blocks = total_minutes < 75 ? 4 : 4;

    // Fixed warmup/cooldown min
    const warmup = Math.min(10, Math.max(3, Math.round(total_minutes * 0.12)));
    const cooldown = Math.min(10, Math.max(2, Math.round(total_minutes * 0.08)));
    let remaining = total_minutes - warmup - cooldown;
    if (remaining < 0) { // small totals: compress into 1 block
      return res.json({
        total_minutes,
        num_blocks: 1,
        blocks: [{
          id: 1,
          duration_min: total_minutes,
          type: 'Quick Sequence',
          target_muscles: [muscle_group || 'Full body'],
          intensity: 'Low',
          purpose: 'Condensed session'
        }]
      });
    }

    // Decide how many main blocks (excluding warmup & cooldown)
    let main_count = Math.max(1, num_blocks - 2);
    if (num_blocks <= 2) main_count = 1;

    // split remaining into balanced chunks
    function splitBalanced(total, parts) {
      const base = Math.floor(total / parts);
      const remainder = total % parts;
      const arr = Array(parts).fill(base);
      for (let i = 0; i < remainder; i++) arr[i] += 1;
      return arr;
    }
    const mains = splitBalanced(remaining, main_count);

    // Build blocks
    const blocks = [];
    let id = 1;
    blocks.push({
      id: id++,
      duration_min: warmup,
      type: 'Warmup',
      target_muscles: ['Full body'],
      intensity: 'Low',
      purpose: 'Increase heart rate and joint mobility'
    });
    for (let i = 0; i < mains.length; i++) {
      const dur = mains[i];
      // determine type: favor Strength if user chose muscle_group else alternate
      let type = 'Main Strength';
      if (!muscle_group) {
        type = i % 2 === 0 ? 'Main Strength' : 'Mini HIIT';
      } else {
        type = dur >= 12 ? 'Main Strength' : 'Mini HIIT';
      }
      const intensity = fitness_level === 'Beginner' ? (dur >= 15 ? 'Medium' : 'Low') : (dur >= 15 ? 'High' : 'Medium');
      const target = muscle_group ? [muscle_group] : (type === 'Mini HIIT' ? ['Full body'] : ['Legs','Glutes']);

      blocks.push({
        id: id++,
        duration_min: dur,
        type,
        target_muscles: target,
        intensity,
        purpose: 'Primary stimulus'
      });
    }
    blocks.push({
      id: id++,
      duration_min: cooldown,
      type: 'Cooldown + Mobility',
      target_muscles: ['Full body'],
      intensity: 'Low',
      purpose: 'Recovery'
    });

    // Enforce max 4 blocks: merge smallest if needed
    while (blocks.length > 4) {
      // merge last two
      const a = blocks.pop();
      blocks[blocks.length - 1].duration_min += a.duration_min;
      blocks[blocks.length - 1].type += ' + ' + a.type;
    }

    return res.json({
      request_id: Date.now().toString(),
      total_minutes,
      num_blocks: blocks.length,
      blocks,
      meta: { fitness_level, muscle_preference: muscle_group || 'None' }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
