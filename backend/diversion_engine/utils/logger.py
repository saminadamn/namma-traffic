import logging
import sys
from diversion_engine.config.settings import settings


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(settings.log_level.upper())
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"))
        logger.addHandler(h)
        logger.propagate = False
    return logger
