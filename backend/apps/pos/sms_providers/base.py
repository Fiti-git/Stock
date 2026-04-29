class BaseSmsAdapter:
    def __init__(self, config):
        self.config = config

    def send(self, *, to_phone, body):
        """Send SMS. Returns {provider_ref, raw}. Raises on failure."""
        raise NotImplementedError
