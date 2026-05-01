export default {
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/domain/**", "src/application/**"],
      exclude: [
        "src/infrastructure/**",
        "src/app/**",
        "src/application/ports/**",
        "src/domain/entities/Track.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
};
