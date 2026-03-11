import React, { Component } from 'react';

interface Props {
  defaultTheme?: 'light' | 'dark';
}

interface State {
  theme: 'light' | 'dark';
  systemPreference: 'light' | 'dark';
}

// Legacy class component — needs to be converted to a functional component with hooks
export class ThemeToggle extends Component<Props, State> {
  private mediaQuery: MediaQueryList | null = null;

  constructor(props: Props) {
    super(props);
    const systemPref =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    this.state = {
      theme: props.defaultTheme ?? systemPref,
      systemPreference: systemPref,
    };
    this.handleToggle = this.handleToggle.bind(this);
    this.handleSystemChange = this.handleSystemChange.bind(this);
  }

  componentDidMount() {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', this.handleSystemChange);
    document.documentElement.setAttribute('data-theme', this.state.theme);
  }

  componentDidUpdate(_: Props, prevState: State) {
    if (prevState.theme !== this.state.theme) {
      document.documentElement.setAttribute('data-theme', this.state.theme);
    }
  }

  componentWillUnmount() {
    this.mediaQuery?.removeEventListener('change', this.handleSystemChange);
  }

  handleToggle() {
    this.setState((prev) => ({ theme: prev.theme === 'light' ? 'dark' : 'light' }));
  }

  handleSystemChange(e: MediaQueryListEvent) {
    const pref = e.matches ? 'dark' : 'light';
    this.setState({ systemPreference: pref, theme: pref });
  }

  render() {
    const { theme, systemPreference } = this.state;
    const isDark = theme === 'dark';

    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">
          System: {systemPreference}
        </span>
        <button
          onClick={this.handleToggle}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            isDark ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              isDark ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm font-medium capitalize">{theme}</span>
      </div>
    );
  }
}
