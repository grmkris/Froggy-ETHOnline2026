/**
 * The mandate, editable.
 *
 * Every rule the agent is held to, as a row a person can change. Saving sends
 * the whole mandate; the server keeps the session id and the frozen flag its
 * own, so an edit can never be a way to unfreeze. Nothing here is reachable
 * by the agent — there is no tool that writes a rule.
 */

import { formatUsd, RuleId, usd } from "@froggy/domain";
import type { Mandate, MandateRule } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import { XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

interface MandateEditorProps {
  readonly mandate: Mandate;
  readonly onSave: (mandate: Mandate) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MICROS = 1_000_000;

type Update = (rule: MandateRule) => MandateRule;

const Row = ({
  children,
  label,
}: {
  readonly children: ReactElement;
  readonly label: string;
}): ReactElement => (
  <label className="grid grid-cols-[1fr_9rem] items-center gap-3 text-sm">
    <span>{label}</span>
    {children}
  </label>
);

const Money = ({
  onChange,
  value,
}: {
  readonly onChange: (micros: number) => void;
  readonly value: number;
}): ReactElement => (
  <span className="relative">
    <span className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
      $
    </span>
    <Input
      className="text-money h-8 pl-6 text-right"
      inputMode="decimal"
      min={0}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onChange(usd(parsed));
        }
      }}
      step="0.01"
      type="number"
      value={(value / MICROS).toString()}
    />
  </span>
);

const List = ({
  items,
  label,
  onChange,
  placeholder,
}: {
  readonly items: readonly string[];
  readonly label: string;
  readonly onChange: (items: readonly string[]) => void;
  readonly placeholder: string;
}): ReactElement => {
  const [draft, setDraft] = useState("");
  const add = (): void => {
    const next = draft.trim();
    if (next !== "" && !items.includes(next)) {
      onChange([...items, next]);
    }
    setDraft("");
  };
  return (
    <div className="space-y-1.5 text-sm">
      <span>{label}</span>
      <ul className="space-y-1">
        {items.map((item) => (
          <li className="flex items-center gap-2" key={item}>
            <span className="text-machine flex-1 truncate">{item}</span>
            <Button
              aria-label={`Remove ${item}`}
              onClick={() => {
                onChange(items.filter((entry) => entry !== item));
              }}
              size="icon-xs"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label={`Add to ${label}`}
          className="text-machine h-8"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder={placeholder}
          value={draft}
        />
        <Button size="sm" type="submit" variant="outline">
          Add
        </Button>
      </form>
    </div>
  );
};

const RuleRow = ({
  onChange,
  onRemove,
  rule,
}: {
  readonly onChange: (next: MandateRule) => void;
  readonly onRemove: () => void;
  readonly rule: MandateRule;
}): ReactElement | null => {
  switch (rule._tag) {
    case "per_tx_cap": {
      return (
        <Row label="Per transaction">
          <Money
            onChange={(maxUsdMicros) => {
              onChange({ ...rule, maxUsdMicros: usd(maxUsdMicros / MICROS) });
            }}
            value={rule.maxUsdMicros}
          />
        </Row>
      );
    }
    case "window_cap": {
      return (
        <Row label={`Per ${Math.round(rule.windowMs / 3_600_000)} hours`}>
          <Money
            onChange={(maxUsdMicros) => {
              onChange({ ...rule, maxUsdMicros: usd(maxUsdMicros / MICROS) });
            }}
            value={rule.maxUsdMicros}
          />
        </Row>
      );
    }
    case "approval_threshold": {
      return (
        <Row label="Ask me above">
          <Money
            onChange={(overUsdMicros) => {
              onChange({ ...rule, overUsdMicros: usd(overUsdMicros / MICROS) });
            }}
            value={rule.overUsdMicros}
          />
        </Row>
      );
    }
    case "payee_allowlist": {
      return (
        <List
          items={rule.payeeIds}
          label="Payees the agent may pay"
          onChange={(payeeIds) => {
            onChange({ ...rule, payeeIds });
          }}
          placeholder="0x… or 0.0.…"
        />
      );
    }
    case "host_allowlist": {
      return (
        <List
          items={rule.hosts}
          label="Hosts it may pay a 402 to"
          onChange={(hosts) => {
            onChange({ ...rule, hosts });
          }}
          placeholder="api.example.com"
        />
      );
    }
    case "network_allowlist": {
      return (
        <p className="text-muted-foreground text-sm">
          Chains: {rule.networks.join(", ")}
        </p>
      );
    }
    case "expiry": {
      return (
        <Row label={`Expires ${new Date(rule.notAfter).toLocaleString()}`}>
          <Button
            onClick={() => {
              onChange({ ...rule, notAfter: Date.now() + DAY_MS });
            }}
            size="sm"
            variant="outline"
          >
            Extend a day
          </Button>
        </Row>
      );
    }
    case "ask_exemption": {
      return (
        <Row
          label={`Pre-approved: ${rule.payeeId} up to ${formatUsd(rule.maxUsdMicros)}`}
        >
          <Button onClick={onRemove} size="sm" variant="outline">
            Revoke
          </Button>
        </Row>
      );
    }
    default: {
      return null;
    }
  }
};

export const MandateEditor = ({
  mandate,
  onSave,
}: MandateEditorProps): ReactElement => {
  const [draft, setDraft] = useState<Mandate>(mandate);
  const [saved, setSaved] = useState(false);
  const update = (id: string, change: Update): void => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.id === id ? change(rule) : rule
      ),
    }));
  };
  const remove = (id: string): void => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.id !== id),
    }));
  };
  const hasThreshold = draft.rules.some(
    (rule) => rule._tag === "approval_threshold"
  );
  return (
    <div className="space-y-4">
      {draft.rules.map((rule) => (
        <RuleRow
          key={rule.id}
          onChange={(next) => {
            update(rule.id, () => next);
          }}
          onRemove={() => {
            remove(rule.id);
          }}
          rule={rule}
        />
      ))}
      {hasThreshold ? null : (
        <Button
          onClick={() => {
            setSaved(false);
            setDraft((current) => ({
              ...current,
              rules: [
                ...current.rules,
                {
                  _tag: "approval_threshold",
                  id: RuleId.generate(),
                  overUsdMicros: usd(1),
                },
              ],
            }));
          }}
          size="sm"
          variant="outline"
        >
          Ask me above an amount
        </Button>
      )}
      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={() => {
            onSave(draft);
            setSaved(true);
          }}
          size="sm"
        >
          Save mandate
        </Button>
        <Button
          onClick={() => {
            setDraft(mandate);
            setSaved(false);
          }}
          size="sm"
          variant="ghost"
        >
          Reset
        </Button>
        {saved ? <output className="text-brand text-xs">Saved</output> : null}
      </div>
    </div>
  );
};
