import { Color, TileData, LevelConfig } from '../types';
import { GRID_SIZE, COLORS } from '../constants';

const fillPattern = (grid: (TileData | null)[][], pattern: number[][], availableColors: Color[]) => {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (pattern[y] && pattern[y][x] === 1) {
                // Fill based on pattern, avoiding matches
                const forbiddenColors = new Set<Color>();

                // Check horizontal neighbors
                if (x >= 2 && grid[y][x - 1] && grid[y][x - 2] && grid[y][x - 1]!.color === grid[y][x - 2]!.color) {
                    forbiddenColors.add(grid[y][x - 1]!.color);
                }

                // Check vertical neighbors
                if (y >= 2 && grid[y - 1][x] && grid[y - 2][x] && grid[y - 1][x]!.color === grid[y - 2][x]!.color) {
                    forbiddenColors.add(grid[y - 1][x]!.color);
                }

                const validColors = availableColors.filter(c => !forbiddenColors.has(c));
                // Fallback to all available if strictly impossible (rare with 3+ colors, possible with 2)
                const pool = validColors.length > 0 ? validColors : availableColors;

                const color = pool[Math.floor(Math.random() * pool.length)];
                grid[y][x] = {
                    color,
                    id: `level-${x}-${y}-${Math.random()}`
                };
            }
        }
    }
};

// Patterns: 1 = Filled, 0 = Empty
const Patterns = {
    // Theme 1: Geometric
    HollowSquare: [
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
    ],
    Diamond: [
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
    ],
    Checkerboard: [
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
    ],

    // Theme 2: Symbols
    Smiley: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0, 1, 1, 0],
        [0, 1, 1, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [0, 1, 0, 0, 0, 0, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    Heart: [
        [0, 1, 1, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ],

    // Theme 3: Transportation
    Rocket: [
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 0, 1, 1, 0, 1, 1],
        [1, 0, 0, 1, 1, 0, 0, 1],
    ],
    Boat: [
        [0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 1, 1, 0, 0, 0, 0],
        [0, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 1, 1, 0, 0, 0, 0],
        [0, 0, 1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
    ],

    // Theme 4: Nature
    Tree: [
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
    ],
    Butterfly: [
        [1, 1, 0, 1, 1, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 1, 1, 0, 0, 1],
    ]
};

// Define 20 levels. 
// Level 1: 2 Colors, Simple Pattern
// Progression: Increase target clears, introduce more colors, complex patterns.
export const LEVELS: LevelConfig[] = [
    // Levels 1-5: Geometric (2-3 colors)
    { levelNumber: 1, availableColors: [Color.RED, Color.BLUE], pattern: (g) => fillPattern(g, Patterns.HollowSquare, [Color.RED, Color.BLUE]), targetClears: 15 },
    { levelNumber: 2, availableColors: [Color.GREEN, Color.YELLOW], pattern: (g) => fillPattern(g, Patterns.Diamond, [Color.GREEN, Color.YELLOW]), targetClears: 18 },
    { levelNumber: 3, availableColors: [Color.RED, Color.BLUE, Color.GREEN], pattern: (g) => fillPattern(g, Patterns.Checkerboard, [Color.RED, Color.BLUE, Color.GREEN]), targetClears: 20 },
    { levelNumber: 4, availableColors: [Color.PURPLE, Color.ORANGE], pattern: (g) => fillPattern(g, Patterns.HollowSquare, [Color.PURPLE, Color.ORANGE]), targetClears: 20 },
    { levelNumber: 5, availableColors: [Color.RED, Color.YELLOW, Color.BLUE], pattern: (g) => fillPattern(g, Patterns.Diamond, [Color.RED, Color.YELLOW, Color.BLUE]), targetClears: 22 },

    // Levels 6-10: Symbols (3-4 colors)
    { levelNumber: 6, availableColors: [Color.YELLOW, Color.RED, Color.ORANGE], pattern: (g) => fillPattern(g, Patterns.Smiley, [Color.YELLOW, Color.RED, Color.ORANGE]), targetClears: 25 },
    { levelNumber: 7, availableColors: [Color.RED, Color.PURPLE], pattern: (g) => fillPattern(g, Patterns.Heart, [Color.RED, Color.PURPLE]), targetClears: 25 },
    { levelNumber: 8, availableColors: [Color.BLUE, Color.GREEN, Color.PURPLE, Color.ORANGE], pattern: (g) => fillPattern(g, Patterns.Smiley, [Color.BLUE, Color.GREEN, Color.PURPLE, Color.ORANGE]), targetClears: 25 },

    // Levels 11-15: Transportation (4-5 colors)
    { levelNumber: 9, availableColors: [Color.RED, Color.BLUE, Color.YELLOW, Color.GREEN], pattern: (g) => fillPattern(g, Patterns.Rocket, [Color.RED, Color.BLUE, Color.YELLOW, Color.GREEN]), targetClears: 30 },
    { levelNumber: 10, availableColors: [Color.BLUE, Color.ORANGE, Color.PURPLE], pattern: (g) => fillPattern(g, Patterns.Boat, [Color.BLUE, Color.ORANGE, Color.PURPLE]), targetClears: 30 },

    // Levels 16+: Nature (All colors)
    { levelNumber: 11, availableColors: COLORS, pattern: (g) => fillPattern(g, Patterns.Tree, COLORS), targetClears: 35 },
    { levelNumber: 12, availableColors: COLORS, pattern: (g) => fillPattern(g, Patterns.Butterfly, COLORS), targetClears: 40 },
];
