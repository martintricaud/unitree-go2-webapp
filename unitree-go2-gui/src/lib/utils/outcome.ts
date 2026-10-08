const OUTCOME_NAMES = ['confirmed', 'failed', 'rejected', 'unknown'] as const;

/// The four answers a command can get. `confirmed` means the robot's service accepted the
/// request, which is not the same as having performed the motion; `failed` means it refused
/// and said so; `rejected` means the WebRTC bridge turned the request away before the robot
/// saw it; `unknown` means nothing came back in time, so the command may still have run.
export type OutcomeName = (typeof OUTCOME_NAMES)[number];

/// What the relay decided about one command. `code` is the robot's `status.code` where it sent
/// one, and `detail` is the sentence to show an operator.
export type Outcome = {
    outcome: OutcomeName;
    code: number | null;
    detail: string | null;
};

/// One line of the outcome log: an outcome, the command it belongs to, and when it landed.
/// `reqId` is null for a command sent without one, which the log still shows.
export type OutcomeEntry = Outcome & {
    reqId: number | null;
    label: string;
    at: number;
};

function isOutcomeName(_value: unknown): _value is OutcomeName {
    return (
        typeof _value === 'string' &&
        OUTCOME_NAMES.some(function (_name) {
            return _name === _value;
        })
    );
}

/// Read a relay `command_result` as an Outcome. A field the relay did not send, or sent in a
/// shape this browser does not know, reads as `unknown` rather than as a confirmation.
export function readOutcome(_msg: Record<string, unknown>): Outcome {
    return {
        outcome: isOutcomeName(_msg.outcome) ? _msg.outcome : 'unknown',
        code: typeof _msg.code === 'number' ? _msg.code : null,
        detail: typeof _msg.detail === 'string' ? _msg.detail : null,
    };
}
