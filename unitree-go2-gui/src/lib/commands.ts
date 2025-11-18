export const commands_switches = [
    {
        api_method: "damp",
        description: "Damp the robot's movements",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "balance_stand",
        title: "Balance Stand",
        description: "Balance the robot in a standing position",
    },
    {
        api_method: "sit",
        description: "Sit down",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "rise_sit",
        description: "Rise from sitting position",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "stand_down",
        description: "Stand down",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "stand_up",
        description: "Stand up",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "recovery_stand",
        description: "Recovery stand",
        modeCompatibility: { AI: true, SPORT: true },
    },
];
export const commands_oneshot = [
    {
        api_method: "hello",
        description: "Hello",
        modeCompatibility: { AI: false, SPORT: true },
    },
    {
        api_method: "stretch",
        description: "Stretch",
        modeCompatibility: { AI: false, SPORT: true },
    },
    {
        api_method: "content",
        description: "Content",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "heart",
        description: "Heart",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "frontflip",
        description: "Front flip",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "front_jump",
        description: "Front jump",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "back_flip ",
        description: "Back flip",
        modeCompatibility: { AI: true, SPORT: false },
    },
    {
        api_method: "leftflip",
        description: "Left flip",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "wallow",
        description: "Wallow",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "scrape",
        description: "Scrape",
        modeCompatibility: { AI: true, SPORT: true },
    },
    {
        api_method: "front_pounce",
        description: "Front pounce",
        modeCompatibility: { AI: true, SPORT: true },
    },
];